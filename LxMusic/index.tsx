import {
  fetch,
  Script,
  Navigation,
  NavigationStack,
  TabView,
  Tab,
  Text,
  Button,
  TextField,
  List,
  Section,
  useState,
  useObservable,
  useCallback,
  useEffect,
  useRef,
  HStack,
  VStack,
  ZStack,
  Image,
  Spacer,
  ScrollView,
  ScrollViewReader,
  ScrollViewProxy,
  Slider,
} from 'scripting'

// ============ 类型 ============

interface Song {
  songmid: string
  songid: number
  albummid: string
  songname: string
  singer: Array<{ name: string }>
  albumname?: string
}

interface LyricLine {
  time: number // 秒
  text: string
}

// ============ 常量 ============

const COOKIE_KEY = 'qqmusic.cookie'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
const SAVE_DIR = `${FileManager.documentsDirectory}/QQMusic`
const APP_VERSION = (() => {
  try {
    const json = FileManager.readAsStringSync(`${Script.directory}/script.json`)
    return JSON.parse(json).version ?? '未知'
  } catch {
    return '未知'
  }
})()

// ============ 更新日志 ============

const CHANGELOG: Array<{ version: string; date: string; changes: string[] }> = [
  {
    version: '1.1.0',
    date: '2026-03-01',
    changes: [
      '在线播放与歌词同步',
      '全屏播放器（封面 + 歌词）',
      '适配Liquid Glass 风格',
      '设置页新增更新日志',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-02-23',
    changes: [
      '搜索 QQ 音乐曲库',
      '长按下载歌曲到本地',
    ],
  },
]

// ============ API ============

async function searchSongs(keyword: string, cookie: string, pageSize: number = 20): Promise<Song[]> {
  const url = `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w=${encodeURIComponent(keyword)}&p=1&n=${pageSize}&format=json`
  const response = await fetch(url, {
    headers: { 'Cookie': cookie, 'User-Agent': UA }
  })
  const data = await response.json()
  return data?.data?.song?.list || []
}

async function getMusicUrl(songmid: string, cookie: string): Promise<string> {
  const guid = Math.floor(Math.random() * 9000000000) + 1000000000
  const param = {
    req_0: {
      module: 'vkey.GetVkeyServer',
      method: 'CgiGetVkey',
      param: {
        guid: guid.toString(),
        songmid: [songmid],
        songtype: [0],
        uin: '0',
        loginflag: 1,
        platform: '20',
      }
    }
  }
  const url = `https://u.y.qq.com/cgi-bin/musicu.fcg?data=${encodeURIComponent(JSON.stringify(param))}`
  const response = await fetch(url, {
    headers: { 'Cookie': cookie, 'User-Agent': UA }
  })
  const data = await response.json()
  const purl = data?.req_0?.data?.midurlinfo?.[0]?.purl
  if (!purl) return ''
  const sip = data?.req_0?.data?.sip?.[0] || 'https://ws.stream.qqmusic.qq.com/'
  return sip + purl
}

function getCoverUrl(albummid: string, size: number = 300): string {
  return `https://y.gtimg.cn/music/photo_new/T002R${size}x${size}M000${albummid}.jpg`
}

async function fetchLyricRaw(songmid: string, cookie: string): Promise<string> {
  try {
    const url = `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${songmid}&format=json&nobase64=1`
    const response = await fetch(url, {
      headers: {
        'Cookie': cookie,
        'User-Agent': UA,
        'Referer': 'https://y.qq.com/',
      }
    })
    const data = await response.json()
    return data?.lyric || ''
  } catch {
    return ''
  }
}

async function downloadMusic(url: string, filename: string): Promise<string> {
  const response = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const data = await response.data()
  if (!await FileManager.exists(SAVE_DIR)) {
    await FileManager.createDirectory(SAVE_DIR, true)
  }
  const savePath = `${SAVE_DIR}/${filename}.m4a`
  await FileManager.writeAsData(savePath, data)
  return savePath
}

// ============ 工具 ============

function formatSinger(song: Song): string {
  return song.singer.map(s => s.name).join(' / ')
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\/\\:*?"<>|]/g, '_')
}

function getCookie(): string {
  return Storage.get<string>(COOKIE_KEY) || ''
}

function parseLyric(raw: string): LyricLine[] {
  const lines: LyricLine[] = []
  const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(raw)) !== null) {
    const min = parseInt(match[1], 10)
    const sec = parseInt(match[2], 10)
    const ms = parseInt(match[3], 10)
    const time = min * 60 + sec + ms / (match[3].length === 3 ? 1000 : 100)
    const text = match[4].trim()
    if (text.length > 0) {
      lines.push({ time, text })
    }
  }
  lines.sort((a, b) => a.time - b.time)
  return lines
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function getCurrentLyricIndex(lines: LyricLine[], time: number): number {
  let idx = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= time) idx = i
    else break
  }
  return idx
}

// ============ 搜索页 ============

function SearchView({
  onPlay,
  onDownload,
  playingMid,
}: {
  onPlay: (song: Song) => void
  onDownload: (song: Song) => void
  playingMid: string | null
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Song[]>([])
  const [isSearching, setIsSearching] = useState(false)

  const handleSearch = useCallback(async () => {
    const cookie = getCookie()
    if (!cookie) {
      await Dialog.alert({ title: '请先配置 Cookie', message: '前往设置页面配置' })
      return
    }
    if (!query.trim()) return
    try {
      setIsSearching(true)
      const songs = await searchSongs(query, cookie)
      if (songs.length === 0) {
        await Dialog.alert({ title: '未找到结果', message: '' })
      } else {
        setResults(songs)
      }
    } catch {
      await Dialog.alert({ title: '搜索失败', message: '请检查网络或 Cookie' })
    } finally {
      setIsSearching(false)
    }
  }, [query])

  return (
    <NavigationStack>
      <List
        navigationTitle="搜索"
        toolbar={{
          topBarLeading: (
            <Button action={() => Script.exit()} buttonStyle="plain">
              <Image systemName="xmark.circle.fill" foregroundStyle="secondaryLabel" />
            </Button>
          ),
        }}
        searchable={{
          value: query,
          onChanged: setQuery,
          prompt: '歌曲、歌手',
        }}
        onSubmit={{
          triggers: 'search',
          action: handleSearch,
        }}
      >
        {isSearching && (
          <Section>
            <Text foregroundStyle="secondaryLabel">搜索中...</Text>
          </Section>
        )}

        {results.length > 0 && (
          <Section header={<Text>点击播放 / 长按下载</Text>}>
            {results.map((song: Song, index: number) => (
              <HStack
                key={`${song.songmid}-${index}`}
                spacing={12}
                onTapGesture={() => onPlay(song)}
                onLongPressGesture={{
                  minDuration: 500,
                  perform: () => onDownload(song),
                }}
              >
                <VStack alignment="leading" spacing={4}>
                  <HStack spacing={6}>
                    {playingMid === song.songmid && (
                      <Image
                        systemName="waveform"
                        foregroundStyle="systemBlue"
                        symbolEffect={{
                          effect: "variableColorIterative",
                          value: playingMid,
                        }}
                      />
                    )}
                    <Text font="headline" lineLimit={1}>{song.songname}</Text>
                  </HStack>
                  <Text font="subheadline" foregroundStyle="secondaryLabel" lineLimit={1}>
                    {formatSinger(song)}
                  </Text>
                </VStack>
                <Spacer />
                <Image
                  systemName="ellipsis"
                  foregroundStyle="tertiaryLabel"
                />
              </HStack>
            ))}
          </Section>
        )}
      </List>
    </NavigationStack>
  )
}

// ============ 播放页（全屏模态） ============

function PlayerView({
  song,
  isPlaying,
  currentTime,
  duration,
  lyricLines,
  onPlayPause,
  onSeek,
  onDismiss,
}: {
  song: Song
  isPlaying: boolean
  currentTime: number
  duration: number
  lyricLines: LyricLine[]
  onPlayPause: () => void
  onSeek: (time: number) => void
  onDismiss: () => void
}) {
  const proxyRef = useRef<ScrollViewProxy>()
  const currentIdx = getCurrentLyricIndex(lyricLines, currentTime)
  const [showFullLyric, setShowFullLyric] = useState(false)

  // 歌词自动滚动（完整歌词模式）
  useEffect(() => {
    if (showFullLyric && currentIdx >= 0 && proxyRef.current) {
      withAnimation(() => {
        proxyRef.current?.scrollTo(`lyric-${currentIdx}`, 'center')
      })
    }
  }, [currentIdx, showFullLyric])

  const coverUrl = getCoverUrl(song.albummid, 800)

  if (showFullLyric) {
    // 完整歌词页
    return (
      <ZStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
        <Image
          imageUrl={coverUrl}
          resizable
          scaleToFill
          ignoresSafeArea
          blur={80}
          frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
        />
        <VStack
          background="rgba(0,0,0,0.4)"
          ignoresSafeArea
          frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
        />

        <VStack spacing={0} frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
          {/* 顶部 - 点击标题返回封面 */}
          <HStack padding={{ horizontal: 20, top: 56 }}>
            <Button action={() => setShowFullLyric(false)} buttonStyle="plain">
              <Image systemName="chevron.down" font={20} foregroundStyle="white" />
            </Button>
            <Spacer />
            <VStack
              spacing={2}
              onTapGesture={() => setShowFullLyric(false)}
            >
              <Text font="body" fontWeight="semibold" foregroundStyle="white">
                {song.songname}
              </Text>
              <Text font="subheadline" foregroundStyle="rgba(255,255,255,0.6)">
                {formatSinger(song)}
              </Text>
            </VStack>
            <Spacer />
            <VStack frame={{ width: 20 }} />
          </HStack>

          {/* 歌词滚动 - 居中 */}
          <ScrollViewReader>
            {(proxy) => {
              proxyRef.current = proxy
              return (
                <ScrollView
                  frame={{ maxHeight: "infinity" }}
                  padding={{ horizontal: 24, top: 32, bottom: 16 }}
                >
                  <VStack spacing={24}>
                    {lyricLines.map((line, i) => (
                      <Text
                        key={`lyric-${i}`}
                        font={i === currentIdx ? "title2" : "title3"}
                        fontWeight={i === currentIdx ? 'bold' : 'regular'}
                        foregroundStyle={i === currentIdx ? 'white' : 'rgba(255,255,255,0.3)'}
                        multilineTextAlignment="center"
                      >
                        {line.text}
                      </Text>
                    ))}
                  </VStack>
                </ScrollView>
              )
            }}
          </ScrollViewReader>

          {/* 底部进度+控制 */}
          <VStack spacing={4}>
            <Slider
              min={0}
              max={duration > 0 ? duration : 1}
              value={currentTime}
              onChanged={onSeek}
              tint="white"
              frame={{ width: 340 }}
            />
            <HStack frame={{ width: 340 }}>
              <Text font="caption" foregroundStyle="rgba(255,255,255,0.6)">
                {formatTime(currentTime)}
              </Text>
              <Spacer />
              <Text font="caption" foregroundStyle="rgba(255,255,255,0.6)">
                {formatTime(duration)}
              </Text>
            </HStack>
          </VStack>
          <HStack padding={{ bottom: 48, top: 16 }}>
            <Spacer />
            <Button action={onPlayPause} buttonStyle="plain">
              <Image
                systemName={isPlaying ? 'pause.circle.fill' : 'play.circle.fill'}
                font={52}
                foregroundStyle="white"
              />
            </Button>
            <Spacer />
          </HStack>
        </VStack>
      </ZStack>
    )
  }

  // 默认播放页
  return (
    <ZStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
      <Image
        imageUrl={coverUrl}
        resizable
        scaleToFill
        ignoresSafeArea
        blur={80}
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      />
      <VStack
        background="rgba(0,0,0,0.25)"
        ignoresSafeArea
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      />

      <VStack spacing={0} frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>

        {/* 顶部关闭按钮 */}
        <HStack padding={{ horizontal: 20, top: 56 }}>
          <Button action={onDismiss} buttonStyle="plain">
            <Image systemName="chevron.down" font={20} foregroundStyle="white" />
          </Button>
          <Spacer />
        </HStack>

        <Spacer />

        {/* 封面居中显示 */}
        <VStack>
          <Image
            imageUrl={coverUrl}
            resizable
            scaleToFit
            frame={{ width: 300, height: 300 }}
            clipShape={{ type: "rect", cornerRadius: 12 }}
            shadow={{ color: "rgba(0,0,0,0.4)", radius: 16, x: 0, y: 8 }}
          />
        </VStack>

        {/* 歌曲信息 - 居中 */}
        <VStack spacing={6} padding={{ horizontal: 20, top: 24 }}>
          <Text font="title2" fontWeight="bold" foregroundStyle="white" lineLimit={1}>
            {song.songname}
          </Text>
          <Text font="body" foregroundStyle="rgba(255,255,255,0.7)" lineLimit={1}>
            {formatSinger(song)}
          </Text>
        </VStack>

        {/* 当前歌词（点击进入完整歌词） */}
        <VStack
          spacing={10}
          padding={{ horizontal: 20, top: 24 }}
          onTapGesture={() => setShowFullLyric(true)}
        >
          {lyricLines.length > 0 ? (
            <VStack spacing={8}>
              <Text
                font="title3"
                fontWeight="semibold"
                foregroundStyle="white"
                multilineTextAlignment="center"
                lineLimit={2}
              >
                {currentIdx >= 0 ? lyricLines[currentIdx].text : '...'}
              </Text>
              {currentIdx + 1 < lyricLines.length && (
                <Text
                  font="body"
                  foregroundStyle="rgba(255,255,255,0.45)"
                  multilineTextAlignment="center"
                  lineLimit={1}
                >
                  {lyricLines[currentIdx + 1].text}
                </Text>
              )}
            </VStack>
          ) : (
            <Text font="body" foregroundStyle="rgba(255,255,255,0.4)">
              暂无歌词
            </Text>
          )}
        </VStack>

        <Spacer />

        {/* 进度条 */}
        <VStack spacing={4}>
          <Slider
            min={0}
            max={duration > 0 ? duration : 1}
            value={currentTime}
            onChanged={onSeek}
            tint="white"
            frame={{ width: 340 }}
          />
          <HStack frame={{ width: 340 }}>
            <Text font="caption" foregroundStyle="rgba(255,255,255,0.6)">
              {formatTime(currentTime)}
            </Text>
            <Spacer />
            <Text font="caption" foregroundStyle="rgba(255,255,255,0.6)">
              {formatTime(duration)}
            </Text>
          </HStack>
        </VStack>

        {/* 播放/暂停 */}
        <HStack padding={{ bottom: 48, top: 16 }}>
          <Spacer />
          <Button action={onPlayPause} buttonStyle="plain">
            <Image
              systemName={isPlaying ? 'pause.circle.fill' : 'play.circle.fill'}
              font={52}
              foregroundStyle="white"
            />
          </Button>
          <Spacer />
        </HStack>

      </VStack>
    </ZStack>
  )
}

// ============ 设置页 ============

function SettingsView() {
  const [cookie, setCookie] = useState(getCookie())
  const [testLabel, setTestLabel] = useState('测试连接')
  const [saveLabel, setSaveLabel] = useState('保存')
  const [showHelp, setShowHelp] = useState(false)
  const [showChangelog, setShowChangelog] = useState(false)

  async function handleSave() {
    Storage.set(COOKIE_KEY, cookie)
    setSaveLabel('已保存 ✓')
    setTimeout(() => setSaveLabel('保存'), 1500)
  }

  async function handleTest() {
    if (!cookie.trim()) {
      await Dialog.alert({ title: '请先输入 Cookie', message: '' })
      return
    }
    try {
      setTestLabel('测试中...')
      const songs = await searchSongs('周杰伦', cookie, 1)
      if (songs.length > 0) {
        setTestLabel('连接成功 ✓')
      } else {
        setTestLabel('连接失败 ✗')
      }
    } catch {
      setTestLabel('连接失败 ✗')
    }
    setTimeout(() => setTestLabel('测试连接'), 2000)
  }

  async function handleClear() {
    Storage.remove(COOKIE_KEY)
    setCookie('')
    await Dialog.alert({ title: '已清除', message: '' })
  }

  return (
    <NavigationStack>
      <List
        navigationTitle="设置"
        toolbar={{
          topBarLeading: (
            <Button action={() => Script.exit()} buttonStyle="plain">
              <Image systemName="xmark.circle.fill" foregroundStyle="secondaryLabel" />
            </Button>
          ),
        }}
        sheet={{
          isPresented: showHelp,
          onChanged: setShowHelp,
          content: (
            <VStack
              presentationDetents={[0.35]}
              presentationDragIndicator="visible"
              padding={{ horizontal: 24 }}
              frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
              spacing={24}
            >
              <Spacer />
              <Text font="title2" fontWeight="bold">Cookie 获取方法</Text>
              <Spacer />
              <VStack spacing={12}>
                <Text font="body" multilineTextAlignment="center">· 浏览器打开 y.qq.com 并登录</Text>
                <Text font="body" multilineTextAlignment="center">· F12 打开开发者工具</Text>
                <Text font="body" multilineTextAlignment="center">· 切换到 Network 标签并刷新</Text>
                <Text font="body" multilineTextAlignment="center">· 复制任意请求中的 Cookie</Text>
                <Text font="body" multilineTextAlignment="center">· 粘贴到上方输入框并保存</Text>
              </VStack>
              <Spacer />
              <Spacer />
            </VStack>
          ),
        }}
      >
        <Section header={<Text>Cookie 配置</Text>}>
          <HStack>
            <Image
              systemName={getCookie() ? 'checkmark.circle.fill' : 'xmark.circle'}
              foregroundStyle={getCookie() ? 'systemGreen' : 'systemGray'}
            />
            <Text>{getCookie() ? '已配置' : '未配置'}</Text>
          </HStack>
          <TextField
            title="Cookie"
            value={cookie}
            prompt="粘贴 QQ 音乐 Cookie..."
            onChanged={setCookie}
          />
          <HStack spacing={12}>
            <Button title={saveLabel} action={handleSave} buttonStyle="glass" />
            <Button title={testLabel} action={handleTest} buttonStyle="glass" />
          </HStack>
          <Button title="清除 Cookie" role="destructive" action={handleClear} />
        </Section>

        <Section header={<Text>获取方法</Text>}>
          <HStack contentShape="rect" onTapGesture={() => setShowHelp(true)}>
            <Text>如何获取 Cookie？</Text>
            <Spacer />
            <Image systemName="chevron.right" foregroundStyle="tertiaryLabel" />
          </HStack>
        </Section>

        <Section header={<Text>存储位置</Text>}>
          <Text font="footnote" foregroundStyle="secondaryLabel">
            下载的音乐保存在 Documents/QQMusic/ 目录
          </Text>
        </Section>

        <Section header={<Text>关于</Text>}>
          <HStack
            contentShape="rect"
            onTapGesture={() => Safari.openURL('https://t.me/Lx_hub')}
          >
            <Text>凉心の小窝</Text>
            <Spacer />
            <Image systemName="arrow.up.right" foregroundStyle="tertiaryLabel" />
          </HStack>
          <HStack
            contentShape="rect"
            onTapGesture={() => setShowChangelog(true)}
            sheet={{
              isPresented: showChangelog,
              onChanged: setShowChangelog,
              content: (
                <NavigationStack>
                  <List
                    navigationTitle="更新日志"
                    presentationDetents={["large"]}
                    presentationDragIndicator="visible"
                    toolbar={{
                      topBarTrailing: (
                        <Button action={() => setShowChangelog(false)} buttonStyle="plain">
                          <Image systemName="checkmark.circle.fill" foregroundStyle="systemBlue" font="title3" />
                        </Button>
                      ),
                    }}
                  >
                    {CHANGELOG.map((entry) => (
                      <Section
                        key={entry.version}
                        header={<Text>{`v${entry.version}  ·  ${entry.date}`}</Text>}
                      >
                        {entry.changes.map((change: string, i: number) => (
                          <HStack key={`${entry.version}-${i}`} spacing={8}>
                            <Image systemName="plus.circle.fill" foregroundStyle="systemGreen" font="subheadline" />
                            <Text font="subheadline">{change}</Text>
                          </HStack>
                        ))}
                      </Section>
                    ))}
                  </List>
                </NavigationStack>
              ),
            }}
          >
            <Text>更新日志</Text>
            <Spacer />
            <Image systemName="chevron.right" foregroundStyle="tertiaryLabel" />
          </HStack>
          <HStack>
            <Text>版本</Text>
            <Spacer />
            <Text foregroundStyle="secondaryLabel">{APP_VERSION}</Text>
          </HStack>
        </Section>
      </List>
    </NavigationStack>
  )
}

// ============ 主视图 ============

function App() {
  const selection = useObservable<string>('search')
  const [currentSong, setCurrentSong] = useState<Song | null>(null)
  const [currentPlayer, setCurrentPlayer] = useState<AVPlayer | null>(null)
  const [playingMid, setPlayingMid] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [lyricLines, setLyricLines] = useState<LyricLine[]>([])
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [showPlayer, setShowPlayer] = useState(false)
  const [coverUrl, setCoverUrl] = useState('')
  const [coverImage, setCoverImage] = useState<UIImage | null>(null)

  // 定时更新播放进度
  useEffect(() => {
    if (!currentPlayer || !isPlaying) return
    let timerId: number

    const tick = () => {
      if (currentPlayer) {
        const t = currentPlayer.currentTime
        setCurrentTime(t)
        if (currentPlayer.duration > 0) {
          setDuration(currentPlayer.duration)
        }
      }
      timerId = setTimeout(tick, 500)
    }
    tick()

    return () => clearTimeout(timerId)
  }, [currentPlayer, isPlaying])

  // 播放
  async function handlePlay(song: Song) {
    const cookie = getCookie()
    try {
      if (currentPlayer) {
        currentPlayer.stop()
        currentPlayer.dispose()
        setCurrentPlayer(null)
        setPlayingMid(null)
        setIsPlaying(false)
      }

      const musicUrl = await getMusicUrl(song.songmid, cookie)
      if (!musicUrl) {
        await Dialog.alert({ title: '获取链接失败', message: '该歌曲可能需要 VIP' })
        return
      }

      await SharedAudioSession.setCategory('playback', ['mixWithOthers'])
      await SharedAudioSession.setActive(true)

      // 加载歌词
      setLyricLines([])
      setCurrentTime(0)
      setDuration(0)
      setCoverUrl(getCoverUrl(song.albummid, 300))
      UIImage.fromURL(getCoverUrl(song.albummid, 300)).then(img => {
        if (img) setCoverImage(img)
      })
      fetchLyricRaw(song.songmid, cookie).then(raw => {
        setLyricLines(parseLyric(raw))
      })

      const player = new AVPlayer()
      if (player.setSource(musicUrl)) {
        player.onReadyToPlay = () => {
          player.play()
          setCurrentSong(song)
          setPlayingMid(song.songmid)
          setIsPlaying(true)
          setDuration(player.duration)
          setShowPlayer(true)
        }
        player.onEnded = () => {
          setIsPlaying(false)
          setCurrentTime(0)
        }
        player.onError = (msg: string) => {
          Dialog.alert({ title: '播放出错', message: msg })
          setPlayingMid(null)
          setIsPlaying(false)
          player.dispose()
          setCurrentPlayer(null)
        }
        setCurrentPlayer(player)
      } else {
        player.dispose()
        await Dialog.alert({ title: '播放失败', message: '无法加载音频源' })
      }
    } catch {
      await Dialog.alert({ title: '播放失败', message: '' })
    }
  }

  // 暂停/继续
  function handlePlayPause() {
    if (!currentPlayer) return
    if (isPlaying) {
      currentPlayer.pause()
      setIsPlaying(false)
    } else {
      // 播放结束后重新播放：seek 回起点
      if (currentTime >= duration && duration > 0) {
        currentPlayer.currentTime = 0
        setCurrentTime(0)
      }
      currentPlayer.play()
      setIsPlaying(true)
    }
  }

  // 跳转
  function handleSeek(time: number) {
    if (!currentPlayer) return
    currentPlayer.currentTime = time
    setCurrentTime(time)
  }

  // 下载
  async function handleDownload(song: Song) {
    const cookie = getCookie()
    try {
      const musicUrl = await getMusicUrl(song.songmid, cookie)
      if (!musicUrl) {
        await Dialog.alert({ title: '获取链接失败', message: '该歌曲可能需要 VIP' })
        return
      }
      const filename = sanitizeFilename(`${song.songname} - ${formatSinger(song)}`)
      const savePath = await downloadMusic(musicUrl, filename)
      await Dialog.alert({ title: '下载完成', message: savePath })
    } catch {
      await Dialog.alert({ title: '下载失败', message: '请检查网络连接' })
    }
  }

  return (
    <TabView
      selection={selection}
      tabBarMinimizeBehavior="onScrollDown"
      tabViewBottomAccessory={
        currentSong ? (
          <HStack
            spacing={12}
            padding={{ horizontal: 16, vertical: 10 }}
            onTapGesture={() => setShowPlayer(true)}
          >
            {coverImage && (
              <Image
                image={coverImage}
                resizable
                scaleToFill
                frame={{ width: 36, height: 36 }}
                clipShape={{ type: "rect", cornerRadius: 6 }}
              />
            )}
            <VStack alignment="leading" spacing={2}>
              <Text font="subheadline" fontWeight="semibold" lineLimit={1}>
                {currentSong.songname}
              </Text>
              <Text font="caption2" foregroundStyle="secondaryLabel" lineLimit={1}>
                {formatSinger(currentSong)}
              </Text>
            </VStack>
            <Spacer />
            <Button action={handlePlayPause} buttonStyle="plain">
              <Image
                systemName={isPlaying ? 'pause.fill' : 'play.fill'}
                font={20}
              />
            </Button>
          </HStack>
        ) : undefined
      }
    >
      <Tab
        title="搜索"
        systemImage="magnifyingglass"
        value="search"
        role="search"
      >
        <VStack
          sheet={{
            isPresented: showPlayer,
            onChanged: setShowPlayer,
            content: currentSong ? (
              <VStack
                presentationDetents={["large"]}
                presentationDragIndicator="hidden"
              >
                <PlayerView
                  song={currentSong}
                  isPlaying={isPlaying}
                  currentTime={currentTime}
                  duration={duration}
                  lyricLines={lyricLines}
                  onPlayPause={handlePlayPause}
                  onSeek={handleSeek}
                  onDismiss={() => setShowPlayer(false)}
                />
              </VStack>
            ) : <VStack />,
          }}
        >
          <SearchView
            onPlay={handlePlay}
            onDownload={handleDownload}
            playingMid={playingMid}
          />
        </VStack>
      </Tab>

      <Tab
        title="设置"
        systemImage="gearshape.fill"
        value="settings"
      >
        <SettingsView />
      </Tab>
    </TabView>
  )
}

// ============ 入口 ============

async function run() {
  await Navigation.present({
    element: <App />,
    modalPresentationStyle: 'fullScreen',
  })
  Script.exit()
}

run()
