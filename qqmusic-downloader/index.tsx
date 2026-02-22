import { fetch, Script, Navigation, Text, Button, TextField, List, Section, useState, HStack, Image, Picker } from 'scripting'

const CONFIG_KEY = 'qq_music_config'

interface Song {
  songmid: string
  songid: number
  albummid: string
  songname: string
  singer: Array<{ name: string }>
}

function getCookie(): string {
  return Storage.get<string>(CONFIG_KEY) || ''
}

function saveCookie(cookie: string) {
  Storage.set(CONFIG_KEY, cookie)
}

async function searchSong(name: string, cookie: string): Promise<Song | null> {
  const url = `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w=${encodeURIComponent(name)}&p=1&n=1&format=json`
  
  const response = await fetch(url, {
    headers: {
      'Cookie': cookie,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  })
  
  const data = await response.json()
  return data?.data?.song?.list?.[0] || null
}

async function getMusicUrl(songmid: string, cookie: string): Promise<string> {
  const guid = Math.floor(Math.random() * 9000000000) + 1000000000
  const requestData = {
    req_0: {
      module: 'vkey.GetVkeyServer',
      method: 'CgiGetVkey',
      param: {
        guid: guid.toString(),
        songmid: [songmid],
        songtype: [0],
        uin: '0',
        loginflag: 1,
        platform: '20'
      }
    }
  }
  
  const url = `https://u.y.qq.com/cgi-bin/musicu.fcg?data=${encodeURIComponent(JSON.stringify(requestData))}`
  const response = await fetch(url, {
    headers: {
      'Cookie': cookie,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  })
  
  const data = await response.json()
  const purl = data?.req_0?.data?.midurlinfo?.[0]?.purl
  if (!purl) return ''
  
  const sip = data.req_0.data.sip?.[0] || 'https://ws.stream.qqmusic.qq.com/'
  return sip + purl
}

async function downloadMusic(url: string, filename: string): Promise<string> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  })
  
  if (!response.ok) throw new Error(`下载失败 ${response.status}`)
  
  const data = await response.data()
  const dir = `${FileManager.documentsDirectory}/QQMusic`
  const savePath = `${dir}/${filename}.m4a`
  
  if (!await FileManager.exists(dir)) {
    await FileManager.createDirectory(dir, true)
  }
  
  await FileManager.writeAsData(savePath, data)
  return savePath
}

function App() {
  const [tab, setTab] = useState('download')
  const [cookie, setCookie] = useState(getCookie())
  const [songName, setSongName] = useState('')
  const [status, setStatus] = useState('')

  async function handleSaveCookie() {
    saveCookie(cookie)
    await Dialog.alert({ title: '保存成功', message: '' })
  }

  async function handleTestCookie() {
    if (!cookie.trim()) {
      await Dialog.alert({ title: '请输入Cookie', message: '' })
      return
    }

    try {
      const song = await searchSong('周杰伦', cookie)
      if (song) {
        await Dialog.alert({ title: '测试成功', message: `找到歌曲: ${song.songname}` })
      } else {
        await Dialog.alert({ title: '测试失败', message: '' })
      }
    } catch (error) {
      await Dialog.alert({ title: '测试失败', message: '' })
    }
  }

  async function handleDownload() {
    const currentCookie = getCookie()
    
    if (!currentCookie) {
      await Dialog.alert({ title: '请先配置Cookie', message: '' })
      setTab('config')
      return
    }

    if (!songName.trim()) {
      await Dialog.alert({ title: '请输入歌曲名', message: '' })
      return
    }

    try {
      setStatus('搜索中...')
      const song = await searchSong(songName, currentCookie)
      
      if (!song) {
        await Dialog.alert({ title: '未找到歌曲', message: '' })
        setStatus('')
        return
      }
      
      const title = song.songname
      const singer = song.singer.map(s => s.name).join('/')
      setStatus(`${title} - ${singer}`)
      
      setStatus('获取链接...')
      const musicUrl = await getMusicUrl(song.songmid, currentCookie)
      
      if (!musicUrl) {
        await Dialog.alert({ title: '获取失败', message: '可能需要VIP' })
        setStatus('')
        return
      }
      
      setStatus('下载中...')
      const filename = `${title}-${singer}`.replace(/[\/\\:*?"<>|]/g, '_')
      const savePath = await downloadMusic(musicUrl, filename)
      
      await Dialog.alert({ title: '下载完成', message: savePath })
      setStatus('')
      
    } catch (error) {
      await Dialog.alert({ title: '操作失败', message: '' })
      setStatus('')
    }
  }

  return (
    <List navigationTitle="QQ音乐下载器">
      <Section>
        <Picker
          title="功能"
          value={tab}
          onChanged={(v: string) => setTab(v)}
        >
          <Text tag="download">下载歌曲</Text>
          <Text tag="config">配置</Text>
        </Picker>
        
        <HStack>
          <Image
            systemName={getCookie() ? 'checkmark.circle.fill' : 'exclamationmark.triangle'}
            foregroundStyle={getCookie() ? 'green' : 'orange'}
          />
          <Text>{getCookie() ? '已配置Cookie' : '未配置Cookie'}</Text>
        </HStack>
      </Section>

      {tab === 'download' ? (
        <>
          <Section header={<Text>下载歌曲</Text>}>
            <TextField
              title="歌曲名"
              value={songName}
              prompt="输入歌曲名称"
              onChanged={setSongName}
            />
            <Button title="搜索并下载" action={handleDownload} />
          </Section>
          
          {status ? (
            <Section header={<Text>状态</Text>}>
              <Text>{status}</Text>
            </Section>
          ) : null}
        </>
      ) : (
        <>
          <Section header={<Text>Cookie配置</Text>}>
            <HStack>
              <Image
                systemName={cookie ? 'checkmark.circle.fill' : 'xmark.circle'}
                foregroundStyle={cookie ? 'green' : 'gray'}
              />
              <Text>{cookie ? '有效' : '未设置'}</Text>
            </HStack>
            
            <TextField
              title="Cookie"
              value={cookie}
              prompt="粘贴QQ音乐Cookie..."
              onChanged={setCookie}
            />
            
            <Button title="保存" action={handleSaveCookie} />
            <Button title="测试" action={handleTestCookie} />
          </Section>

          <Section header={<Text>使用说明</Text>}>
            <Text>1. 打开 y.qq.com 并登录</Text>
            <Text>2. F12 打开开发者工具</Text>
            <Text>3. Network 标签刷新页面</Text>
            <Text>4. 复制请求中的 Cookie</Text>
            <Text>5. 粘贴到上方并保存</Text>
          </Section>
        </>
      )}
    </List>
  )
}

async function main() {
  await Navigation.present({ element: <App /> })
  Script.exit()
}

main().catch((err) => {
  console.error('错误:', err)
  Script.exit()
})
