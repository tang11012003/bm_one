# 🚀 ProtoHub 独立云端/本地后端服务

面向产品经理的原型交付与需求变更工作台（带原生官方打点标注与需求文档管理引擎）。

---

## 🛠️ 本地运行方式 (IDEA / VSCode / 终端)

### 方式 1：终端一键启动
```bash
# 1. 进入服务端目录
cd protohub-cloud-server

# 2. 安装依赖（首次运行）
npm install

# 3. 启动服务 (默认端口 9000)
node server.js
```
启动成功后，在浏览器直接打开：[http://localhost:9000](http://localhost:9000) 即可！

---

### 方式 2：在 IntelliJ IDEA / WebStorm 中运行
1. 用 IDEA 打开 `protohub-cloud-server` 文件夹；
2. 打开 `server.js` 文件；
3. 右键点击代码空白处 -> 选择 **Run 'server.js'**；
4. 控制台输出 `🎉 ProtoHub 独立后端服务启动成功！` 后，点击链接在浏览器打开即可。

---

## 🌐 免费一键部署到云端公网 (Render / Railway / Vercel)

### 方案 A：部署到 Render (免费、一键上线)
1. 将当前项目或 `protohub-cloud-server` 文件夹推送到您的 GitHub 仓库；
2. 登录 [https://render.com](https://render.com)（支持 GitHub 一键登录）；
3. 点击 **New +** -> **Web Service**；
4. 选择您的 GitHub 仓库；
5. 配置项填写：
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
6. 点击 **Create Web Service**，1 分钟后即可获得专属公网访问域名（如 `https://protohub-xxx.onrender.com`）！
