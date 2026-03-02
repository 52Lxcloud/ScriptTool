// 安杰智慧社区 - 控制中心按钮

import { ControlWidget, ControlWidgetButton } from 'scripting'
import { CACHE_KEY, CachedDoor } from './shared'
import { OpenDoorIntent } from './app_intents'

// 同步读取缓存
const cached = Storage.get<CachedDoor>(CACHE_KEY)
const doorName = cached?.lockName || '一键开门'

ControlWidget.present(
    <ControlWidgetButton
        intent={OpenDoorIntent(undefined)}
        label={{
            title: doorName,
            systemImage: 'door.left.hand.open',
        }}
        activeValueLabel={{
            title: '已开启',
            systemImage: 'door.left.hand.open',
        }}
        inactiveValueLabel={{
            title: '点击开门',
            systemImage: 'door.left.hand.closed',
        }}
    />
)
