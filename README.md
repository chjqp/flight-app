# 机票助手 App

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 启动开发服务器
npm start

# 3. 在手机上安装 Expo Go App
# iOS: App Store 搜索 "Expo Go"
# Android: Google Play 搜索 "Expo Go"

# 4. 扫描二维码即可运行
```

## 功能

1. **搜索页** - 输入城市、日期、乘客信息
2. **结果页** - WebView加载去哪儿，JS提取航班数据
3. **订票页** - WebView自动填表

## 架构

- **不用API** - 直接用WebView加载真实网页
- **不用后端** - 纯前端App
- **不会被反爬虫** - WebView = 真实浏览器

## 文件说明

- `app/index.tsx` - 搜索页
- `app/results.tsx` - 结果页（WebView提取数据）
- `app/booking.tsx` - 订票页（WebView自动填表）
- `app/_layout.tsx` - 路由配置
