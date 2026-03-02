import {
    fetch,
    Script,
    Navigation,
    NavigationStack,
    Text,
    Button,
    TextField,
    List,
    Section,
    useState,
    useCallback,
    HStack,
    VStack,
    Image,
    Spacer,
} from 'scripting'
import {
    AUTH_KEY,
    CACHE_KEY,
    AuthInfo,
    Unit,
    Lock,
    CachedDoor,
    apiPost,
} from './shared'

// ============ 登录页 ============

function LoginView({ onLogin }: {
    onLogin: (token: string, userId: string, units: Unit[], username: string) => void
}) {
    const savedAuth = Storage.get<AuthInfo>(AUTH_KEY)
    const [mobile, setMobile] = useState(savedAuth?.mobile || '')
    const [password, setPassword] = useState(savedAuth?.password || '')
    const [loading, setLoading] = useState(false)

    const handleLogin = useCallback(async () => {
        if (!mobile.trim() || !password.trim()) {
            await Dialog.alert({ title: '提示', message: '请输入手机号和密码' })
            return
        }
        try {
            setLoading(true)
            const res = await apiPost('login.do', {
                MOBILE: mobile,
                PASSWORD: password,
                apiVersion: '1',
            })
            if (res.code !== '101') {
                await Dialog.alert({ title: '登录失败', message: res.msg || '未知错误' })
                return
            }
            Storage.set(AUTH_KEY, { mobile, password })

            const token = res.map?.LOGINTOKEN || ''
            const userId = res.rid || ''
            const units = (res.data || []) as Unit[]
            const username = res.map?.USERNAME || mobile
            onLogin(token, userId, units, username)
        } catch (e: any) {
            await Dialog.alert({ title: '网络错误', message: e.message || '请检查网络连接' })
        } finally {
            setLoading(false)
        }
    }, [mobile, password])

    return (
        <NavigationStack>
            <List
                navigationTitle="智慧社区"
                toolbar={{
                    topBarLeading: (
                        <Button action={() => Script.exit()} buttonStyle="plain">
                            <Image systemName="xmark.circle.fill" foregroundStyle="secondaryLabel" />
                        </Button>
                    ),
                }}
            >
                <Section header={<Text>账号信息</Text>} footer={<Text>首次使用请输入安杰智慧社区的账号密码</Text>}>
                    <TextField
                        title="手机号"
                        value={mobile}
                        prompt="请输入手机号..."
                        onChanged={setMobile}
                    />
                    <TextField
                        title="密码"
                        value={password}
                        prompt="请输入密码..."
                        onChanged={setPassword}
                    />
                </Section>
                <Section>
                    <Button
                        title={loading ? '登录中...' : '登录'}
                        action={handleLogin}
                        disabled={loading}
                    />
                </Section>
            </List>
        </NavigationStack>
    )
}

// ============ 单元选择页 ============

function UnitSelectView({ units, token, userId, username, onBack }: {
    units: Unit[]
    token: string
    userId: string
    username: string
    onBack: () => void
}) {
    const [locks, setLocks] = useState<Lock[]>([])
    const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null)
    const [loadingLocks, setLoadingLocks] = useState(false)
    const [opening, setOpening] = useState<string | null>(null)
    const [resultMsg, setResultMsg] = useState('')

    const handleSelectUnit = useCallback(async (unit: Unit) => {
        try {
            setSelectedUnit(unit)
            setLoadingLocks(true)
            setLocks([])
            setResultMsg('')

            const res = await apiPost('getLock.do', {
                BLOCKID: '' + unit.BLOCKID,
                CELLID: '' + unit.CELLID,
                COMMUNITYID: '' + unit.COMMUNITYID,
                UNITID: '' + unit.UNITID,
                USERID: userId,
            }, token)

            if (res.code !== '101') {
                await Dialog.alert({ title: '获取门锁失败', message: res.msg || '未知错误' })
                return
            }
            setLocks((res.data || []) as Lock[])
        } catch (e: any) {
            await Dialog.alert({ title: '网络错误', message: e.message || '请检查网络' })
        } finally {
            setLoadingLocks(false)
        }
    }, [token, userId])

    const handleOpenDoor = useCallback(async (lock: Lock) => {
        if (!selectedUnit) return
        try {
            setOpening(lock.LOCKMAC)
            setResultMsg('')

            const req = {
                BLOCKID: '' + lock.BLOCKID,
                CELLID: '' + lock.CELLID,
                COMMUNITYID: '' + lock.COMMUNITYID,
                LOCKMAC: lock.LOCKMAC,
                PHYSICALFLOOR: '' + lock.PHYSICALFLOOR,
                UNITID: '' + selectedUnit.UNITID,
                USERID: userId,
            }
            const res = await apiPost('openDoorByAliyun.do', req, token)

            console.log('[OPEN_DOOR][APP] request', {
                lockName: lock.LOCKNAME,
                token: token ? '***' : '',
                ...req,
            })
            console.log('[OPEN_DOOR][APP] response', res)

            if (res.code === '101') {
                // 缓存电梯数据，供控制小部件使用
                const cached: CachedDoor = {
                    token,
                    userId,
                    lockName: lock.LOCKNAME,
                    lockMac: lock.LOCKMAC,
                    blockId: '' + lock.BLOCKID,
                    cellId: '' + lock.CELLID,
                    communityId: '' + lock.COMMUNITYID,
                    physicalFloor: '' + lock.PHYSICALFLOOR,
                    unitId: '' + selectedUnit.UNITID,
                }
                Storage.set(CACHE_KEY, cached)
                setResultMsg(`${lock.LOCKNAME} 已开启`)
            } else {
                setResultMsg(`开门失败: ${res.msg}`)
            }
        } catch (e: any) {
            setResultMsg(`网络错误: ${e.message}`)
        } finally {
            setOpening(null)
        }
    }, [token, userId, selectedUnit])

    return (
        <NavigationStack>
            <List
                navigationTitle={username}
                toolbar={{
                    topBarLeading: (
                        <Button action={onBack} buttonStyle="plain">
                            <Image systemName="arrow.left.circle.fill" foregroundStyle="secondaryLabel" />
                        </Button>
                    ),
                    topBarTrailing: (
                        <Button action={() => Script.exit()} buttonStyle="plain">
                            <Image systemName="xmark.circle.fill" foregroundStyle="secondaryLabel" />
                        </Button>
                    ),
                }}
            >
                {/* 单元列表 */}
                <Section header={<Text>选择单元</Text>}>
                    {units.map((unit: Unit, index: number) => (
                        <HStack
                            key={`unit-${index}`}
                            contentShape="rect"
                            onTapGesture={() => handleSelectUnit(unit)}
                        >
                            <Image
                                systemName={selectedUnit?.UNITID === unit.UNITID ? 'building.2.fill' : 'building.2'}
                                foregroundStyle={selectedUnit?.UNITID === unit.UNITID ? 'systemGreen' : 'secondaryLabel'}
                            />
                            <Text fontWeight={selectedUnit?.UNITID === unit.UNITID ? 'semibold' : 'regular'}>
                                {unit.COMMUNITYNAME} {unit.UNITNO || ''}
                            </Text>
                            <Spacer />
                            {selectedUnit?.UNITID === unit.UNITID && (
                                <Image systemName="checkmark" foregroundStyle="systemGreen" />
                            )}
                        </HStack>
                    ))}
                </Section>

                {/* 加载中 */}
                {loadingLocks && (
                    <Section>
                        <HStack>
                            <Image
                                systemName="antenna.radiowaves.left.and.right"
                                foregroundStyle="systemBlue"
                                symbolEffect={{ effect: 'pulse', value: loadingLocks }}
                            />
                            <Text foregroundStyle="secondaryLabel">获取门锁中...</Text>
                        </HStack>
                    </Section>
                )}

                {/* 电梯列表 */}
                {locks.length > 0 && (
                    <Section header={<Text>点击开门</Text>}>
                        {locks.map((lock: Lock, index: number) => {
                            const disabled = opening === lock.LOCKMAC
                            return (
                                <HStack
                                    key={`lock-${index}`}
                                    spacing={12}
                                    contentShape="rect"

                                    onTapGesture={() => {
                                        if (!disabled) handleOpenDoor(lock)
                                    }}
                                >
                                    <Image
                                        systemName={opening === lock.LOCKMAC ? 'door.left.hand.open' : 'door.left.hand.closed'}
                                        foregroundStyle={opening === lock.LOCKMAC ? 'systemOrange' : 'systemGreen'}
                                        font="title3"
                                        symbolEffect={opening === lock.LOCKMAC ? { effect: 'pulse', value: opening ?? undefined } : undefined}
                                    />
                                    <VStack alignment="leading" spacing={2}>
                                        <Text font="body" fontWeight="medium" foregroundStyle="label">
                                            {lock.LOCKNAME}
                                        </Text>
                                        <Text font="caption" foregroundStyle="tertiaryLabel">
                                            {lock.LOCKMAC}
                                        </Text>
                                    </VStack>
                                    <Spacer />
                                    <Image systemName="chevron.right" foregroundStyle="tertiaryLabel" />
                                </HStack>
                            )
                        })}
                    </Section>
                )}

                {/* 结果消息 */}
                {resultMsg !== '' && (
                    <Section>
                        <Text
                            font="headline"
                            foregroundStyle={resultMsg.startsWith('') ? 'systemGreen' : 'systemRed'}
                            multilineTextAlignment="center"
                        >
                            {resultMsg}
                        </Text>
                    </Section>
                )}
            </List>
        </NavigationStack>
    )
}

// ============ 主视图 ============

function App() {
    const [page, setPage] = useState<'login' | 'units'>('login')
    const [token, setToken] = useState('')
    const [userId, setUserId] = useState('')
    const [units, setUnits] = useState<Unit[]>([])
    const [username, setUsername] = useState('')

    const handleLogin = useCallback((t: string, uid: string, u: Unit[], name: string) => {
        setToken(t)
        setUserId(uid)
        setUnits(u)
        setUsername(name)
        setPage('units')
    }, [])

    const handleBack = useCallback(() => {
        setPage('login')
        setToken('')
        setUserId('')
        setUnits([])
    }, [])

    if (page === 'units') {
        return (
            <UnitSelectView
                units={units}
                token={token}
                userId={userId}
                username={username}
                onBack={handleBack}
            />
        )
    }

    return <LoginView onLogin={handleLogin} />
}

// ============ 入口 ============

async function run() {
    await Navigation.present({
        element: <App />,
        modalPresentationStyle: 'pageSheet',
    })
    Script.exit()
}

run()
