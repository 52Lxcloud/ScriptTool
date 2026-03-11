import {
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
    CachedDoor,
    Unit,
    Lock,
    apiPost,
} from './shared'
import {
    CloseButton,
    ResultMessage,
    UnitListItem,
    LockListItem,
} from './ui/components'
import {
    showAlert,
    buildCachedDoor,
} from './ui/services'

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
            await showAlert('提示', '请输入手机号和密码')
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
                await showAlert('登录失败', res.msg || '未知错误')
                return
            }

            Storage.set(AUTH_KEY, { mobile, password })

            const token = res.map?.LOGINTOKEN || ''
            const userId = res.rid || ''
            const units = (res.data || []) as Unit[]
            const username = res.map?.USERNAME || mobile
            onLogin(token, userId, units, username)
        } catch (e: any) {
            await showAlert('网络错误', e.message || '请检查网络连接')
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
                <Section
                    header={<Text>账号信息</Text>}
                    footer={<Text>首次使用请输入安杰智慧社区的账号密码</Text>}
                >
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
    const cachedDoor = Storage.get<CachedDoor>(CACHE_KEY)
    const [locks, setLocks] = useState<Lock[]>([])
    const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null)
    const [defaultLockMac, setDefaultLockMac] = useState<string>(cachedDoor?.lockMac || '')
    const [defaultLockName, setDefaultLockName] = useState<string>(cachedDoor?.lockName || '')
    const [loadingLocks, setLoadingLocks] = useState(false)
    const [opening, setOpening] = useState<string | null>(null)
    const [resultMsg, setResultMsg] = useState('')
    const [resultType, setResultType] = useState<'success' | 'error' | null>(null)

    const resetResult = useCallback(() => {
        setResultMsg('')
        setResultType(null)
    }, [])

    const handleSelectUnit = useCallback(async (unit: Unit) => {
        try {
            setSelectedUnit(unit)
            setLoadingLocks(true)
            setLocks([])
            resetResult()

            const res = await apiPost('getLock.do', {
                BLOCKID: '' + unit.BLOCKID,
                CELLID: '' + unit.CELLID,
                COMMUNITYID: '' + unit.COMMUNITYID,
                UNITID: '' + unit.UNITID,
                USERID: userId,
            }, token)

            if (res.code !== '101') {
                await showAlert('获取门锁失败', res.msg || '未知错误')
                return
            }

            setLocks((res.data || []) as Lock[])
        } catch (e: any) {
            await showAlert('网络错误', e.message || '请检查网络')
        } finally {
            setLoadingLocks(false)
        }
    }, [token, userId, resetResult])

    const handleSetDefaultDoor = useCallback((lock: Lock) => {
        if (!selectedUnit) return

        Storage.set(CACHE_KEY, buildCachedDoor(lock, selectedUnit, token, userId))
        setDefaultLockMac(lock.LOCKMAC)
        setDefaultLockName(lock.LOCKNAME)
        setResultType('success')
        setResultMsg(`已设置下次默认开门为：${lock.LOCKNAME}`)
    }, [token, userId, selectedUnit])

    const handleOpenDoor = useCallback(async (lock: Lock) => {
        if (!selectedUnit) return

        try {
            setOpening(lock.LOCKMAC)
            resetResult()

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
                Storage.set(CACHE_KEY, buildCachedDoor(lock, selectedUnit, token, userId))
                setDefaultLockMac(lock.LOCKMAC)
                setDefaultLockName(lock.LOCKNAME)
                setResultType('success')
                setResultMsg(`${lock.LOCKNAME} 已开启`)
            } else {
                setResultType('error')
                setResultMsg(`开门失败: ${res.msg}`)
            }
        } catch (e: any) {
            setResultType('error')
            setResultMsg(`网络错误: ${e.message}`)
        } finally {
            setOpening(null)
        }
    }, [token, userId, selectedUnit, resetResult])

    return (
        <NavigationStack>
            <List
                navigationTitle={username}
                toolbar={{
                    topBarLeading: (
                        <Button action={onBack} buttonStyle="plain">
                            <Image
                                systemName="arrow.left.circle.fill"
                                foregroundStyle="secondaryLabel"
                            />
                        </Button>
                    ),
                    topBarTrailing: (
                                            <Button action={() => Script.exit()} buttonStyle="plain">
                                                <Image systemName="xmark.circle.fill" foregroundStyle="secondaryLabel" />
                                            </Button>
                                        ),
                }}
            >
                <Section header={<Text>选择单元</Text>}>
                    {units.map((unit: Unit, index: number) => (
                        <UnitListItem
                            key={`unit-${index}`}
                            unit={unit}
                            selected={selectedUnit?.UNITID === unit.UNITID}
                            onPress={() => handleSelectUnit(unit)}
                        />
                    ))}
                </Section>

                {loadingLocks ? (
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
                                ) : (
                                    <Section hidden />
                                )}

                {defaultLockName ? (
                                    <Section>
                                        <VStack alignment="leading" spacing={6}>
                                            <HStack spacing={6}>
                                                <Image systemName="star.fill" foregroundStyle="systemOrange" />
                                                <Text font="caption" foregroundStyle="secondaryLabel">
                                                    下次默认开门
                                                </Text>
                                            </HStack>
                                            <Text font="headline" fontWeight="semibold">
                                                {defaultLockName}
                                            </Text>
                                        </VStack>
                                    </Section>
                                ) : null}

                                {locks.length > 0 ? (
                                                                    <Section header={<Text>门锁列表</Text>}>
                                                                        {locks.map((lock: Lock, index: number) => {
                                                                            const disabled = opening === lock.LOCKMAC
                                                                            const isDefault = defaultLockMac === lock.LOCKMAC

                                                                            return (
                                                                                <LockListItem
                                                                                    key={`lock-${index}`}
                                                                                    lock={lock}
                                                                                    opening={disabled}
                                                                                    onPress={() => {
                                                                                        if (!disabled) handleOpenDoor(lock)
                                                                                    }}
                                                                                    trailing={
                                                                                        isDefault ? (
                                                                                            <HStack spacing={4}>
                                                                                                <Image
                                                                                                    systemName="star.fill"
                                                                                                    foregroundStyle="systemOrange"
                                                                                                    font="caption"
                                                                                                />
                                                                                                <Text
                                                                                                    font="caption"
                                                                                                    fontWeight="medium"
                                                                                                    foregroundStyle="systemOrange"
                                                                                                >
                                                                                                    默认门
                                                                                                </Text>
                                                                                            </HStack>
                                                                                        ) : (
                                                                                            <Button
                                                                                                buttonStyle="plain"
                                                                                                action={() => handleSetDefaultDoor(lock)}
                                                                                                disabled={!selectedUnit}
                                                                                            >
                                                                                                <HStack spacing={4}>
                                                                                                    <Image
                                                                                                        systemName="star"
                                                                                                        foregroundStyle="systemBlue"
                                                                                                        font="caption"
                                                                                                    />
                                                                                                    <Text
                                                                                                        font="caption"
                                                                                                        fontWeight="medium"
                                                                                                        foregroundStyle="systemBlue"
                                                                                                    >
                                                                                                        设为默认
                                                                                                    </Text>
                                                                                                </HStack>
                                                                                            </Button>
                                                                                        )
                                                                                    }
                                                                                />
                                                                            )
                                                                        })}
                                                                    </Section>
                                                                ) : (
                                                                    <Section hidden />
                                                                )}
                <ResultMessage message={resultMsg} type={resultType} />
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