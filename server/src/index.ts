import './env'

const port = Number(process.env.PORT || 3001)
const host = '0.0.0.0'

/** 正式应用（动态导入：安装模式下不加载数据库与业务模块） */
async function startApp() {
  const { buildApp } = await import('./app')
  const app = await buildApp({ logger: true })
  await app.listen({ port, host })
}

if (process.env.DATABASE_URL) {
  await startApp()
} else {
  // 首次部署：尚未配置数据库 → 安装模式；安装完成后在同一进程内切换到正式应用
  const { buildInstallApp } = await import('./install/app')
  const installer = await buildInstallApp(async () => {
    await installer.close()
    await startApp()
  })
  await installer.listen({ port, host })
}
