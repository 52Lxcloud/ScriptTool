# ScriptTool

脚本工具集合，基于 Scripting 框架开发。

## 功能模块

### LxMusic

搜索、播放与下载音乐。

**主要功能：**
- 搜索歌曲 - 支持搜索 QQ 音乐曲库
- 在线播放 - 点击歌曲即可播放，支持歌词同步
- 下载音乐 - 长按歌曲下载到本地
- 全屏播放器 - 封面模式 + 歌词模式，可切换
- Mini 播放器 - Liquid Glass 风格底部常驻

### AnjieDoor

安杰智慧社区一键开门。

**主要功能：**
- 一键开门 - 自动登录并调用开门接口
- 控制组件 - 主屏幕 Widget 一键触发，无需进入 App
- 缓存机制 - 本地缓存门锁信息，加速开门流程
- App Intent - 支持 Siri / 快捷指令调用

## 项目结构

```
ScriptTool/
├── LxMusic/                 # LxMusic 音乐播放器
│   ├── index.tsx            # 主程序
│   └── script.json          # 配置文件
├── AnjieDoor/               # 安杰智慧社区开门
│   ├── index.tsx            # 主程序
│   ├── control_widget_button.tsx  # 控制组件按钮
│   ├── app_intents.tsx      # App Intent 定义
│   ├── shared.ts            # 共享类型与工具函数
│   └── script.json          # 配置文件
└── README.md                # 项目说明
```

## 技术栈

- **框架**: Scripting (类 SwiftUI 的脚本框架)
- **语言**: TypeScript
- **UI**: 声明式 UI 组件 + iOS 26 Liquid Glass
- **音频**: AVPlayer 播放器
- **存储**: FileManager + Storage API

## 开发说明

每个功能模块独立在一个文件夹中，包含：
- `index.tsx` - 主程序代码
- `script.json` - 脚本配置信息

## 作者

凉心 (52lxcloud@gmail.com)
