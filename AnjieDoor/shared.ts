import { fetch } from 'scripting'

// ============ 常量 ============

export const SECRET = 'p!P2QklnjGGaZKlw'
export const HOST = 'http://app.njanjar.com'
export const MOBILE_KEY = 'anjie.mobile'
export const PASSWORD_KEY = 'anjie.password'
export const CACHE_KEY = 'anjie.cached_door'

// ============ 类型 ============

export interface Unit {
    COMMUNITYID: number
    COMMUNITYNAME: string
    BLOCKID: number
    CELLID: number
    UNITID: number
    UNITNO: string
}

export interface Lock {
    LOCKNAME: string
    LOCKMAC: string
    BLOCKID: number
    CELLID: number
    COMMUNITYID: number
    PHYSICALFLOOR: number
}

export interface ApiResponse {
    code: string
    msg: string
    map?: Record<string, string>
    data?: any[]
    rid?: string
}

export interface CachedDoor {
    token: string
    userId: string
    lockName: string
    lockMac: string
    blockId: string
    cellId: string
    communityId: string
    physicalFloor: string
    unitId: string
}

// ============ 工具函数 ============

export function md5(s: string): string {
    const data = Data.fromString(s) as Data
    return Crypto.md5(data).toHexString()
}

export function timestamp(): string {
    return (Date.now() / 1000).toString()
}

export function encodeFormData(params: Record<string, string>): string {
    return Object.keys(params)
        .map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
        .join('&')
}

// ============ API ============

export async function apiPost(
    path: string,
    params: Record<string, string>,
    token?: string
): Promise<ApiResponse> {
    const t = timestamp()
    const ek = params.LOCKMAC || params.COMMUNITYID || params.MOBILE || params.TYPE || ''
    const fkey = md5(ek + t + SECRET)

    const body = encodeFormData({ ...params, TIMESTAMP: t, FKEY: fkey })
    const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
    }
    if (token) headers['LOGINTOKEN'] = token

    const response = await fetch(`${HOST}/appcity/${path}`, {
        method: 'POST',
        headers,
        body,
        allowInsecureRequest: true,
    })
    return await response.json()
}

// 一次开门请求（供 AppIntent 使用）
export async function openDoor(cached: CachedDoor): Promise<{ success: boolean; msg: string }> {
    try {
        const res = await apiPost('openDoorByAliyun.do', {
            BLOCKID: cached.blockId,
            CELLID: cached.cellId,
            COMMUNITYID: cached.communityId,
            LOCKMAC: cached.lockMac,
            PHYSICALFLOOR: cached.physicalFloor,
            UNITID: cached.unitId,
            USERID: cached.userId,
        }, cached.token)

        if (res.code === '101') {
            return { success: true, msg: `${cached.lockName} 已开启` }
        }
        return { success: false, msg: res.msg || '开门失败' }
    } catch (e: any) {
        return { success: false, msg: e.message || '网络错误' }
    }
}
