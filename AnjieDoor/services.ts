import { Lock, Unit, CachedDoor } from './shared'

export async function showAlert(title: string, message: string) {
    await Dialog.alert({ title, message })
}

export function buildCachedDoor(
    lock: Lock,
    selectedUnit: Unit,
    token: string,
    userId: string
): CachedDoor {
    return {
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
}