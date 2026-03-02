// 安杰智慧社区开门 - AppIntent 注册
// 控制小部件触发时执行开门逻辑

import {
    AppIntentManager,
    AppIntentProtocol,
    Notification,
    ControlWidget,
} from 'scripting'
import { CACHE_KEY, CachedDoor, openDoor } from './shared'

// 注册开门 Intent（无需参数，直接从缓存读取）
export const OpenDoorIntent = AppIntentManager.register<undefined>({
    name: 'OpenDoorIntent',
    protocol: AppIntentProtocol.AppIntent,
    perform: async () => {
        const cached = Storage.get<CachedDoor>(CACHE_KEY)
        console.log('[OPEN_DOOR][WIDGET] cached', cached)
        if (!cached) {
            await Notification.schedule({
                title: '安杰智慧社区',
                body: '未找到缓存数据，请先在主程序中开门一次',
            })
            ControlWidget.reloadButtons()
            return
        }

        const result = await openDoor(cached)
        console.log('[OPEN_DOOR][WIDGET] result', result)
        await Notification.schedule({
            title: result.success ? '开门成功' : '开门失败',
            body: result.msg,
        })
        ControlWidget.reloadButtons()
    },
})
