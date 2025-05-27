/**
 * 构建前准备脚本
 * 用于确保构建资源（如图标）正确设置
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('正在准备构建环境...');

// 确保资源目录存在
const resourcesDir = path.join(__dirname, '../resources');
if (!fs.existsSync(resourcesDir)) {
  console.log('创建资源目录:', resourcesDir);
  fs.mkdirSync(resourcesDir, { recursive: true });
}

// 确保assets目录存在
const assetsDir = path.join(__dirname, '../assets');
if (!fs.existsSync(assetsDir)) {
  console.log('创建assets目录:', assetsDir);
  fs.mkdirSync(assetsDir, { recursive: true });
}

// 图标文件
const iconFile = '22-ico.ico';
const rootIconPath = path.join(__dirname, '..', iconFile);
const resourceIconPath = path.join(resourcesDir, iconFile);
const assetIconPath = path.join(assetsDir, iconFile);

// 确保assets目录有图标
if (fs.existsSync(rootIconPath)) {
  console.log(`复制图标 ${rootIconPath} 到 ${assetIconPath}`);
  fs.copyFileSync(rootIconPath, assetIconPath);
} else if (fs.existsSync(assetIconPath)) {
  console.log(`assets目录已有图标 ${assetIconPath}`);
} else {
  console.error('图标文件不存在，既不在根目录也不在assets目录');
  process.exit(1);
}

// 复制图标到资源目录
console.log(`复制图标 ${assetIconPath} 到 ${resourceIconPath}`);
fs.copyFileSync(assetIconPath, resourceIconPath);

// 资源目录的assets子目录
const resourceAssetsDir = path.join(resourcesDir, 'assets');
if (!fs.existsSync(resourceAssetsDir)) {
  console.log('创建资源assets目录:', resourceAssetsDir);
  fs.mkdirSync(resourceAssetsDir, { recursive: true });
}

// 确保资源目录的assets子目录也有图标
const resourceAssetIconPath = path.join(resourceAssetsDir, iconFile);
console.log(`复制图标 ${assetIconPath} 到 ${resourceAssetIconPath}`);
fs.copyFileSync(assetIconPath, resourceAssetIconPath);

// 创建额外的图标格式（如果需要）
try {
  // 检查是否有imagemagick或类似工具可以转换图标格式
  console.log('检查是否可以创建多种格式的图标...');
  // 这里可以添加代码来生成不同尺寸的图标
} catch (err) {
  console.log('跳过创建额外图标格式:', err.message);
}

// 写入特定于Windows的资源配置
const winResFile = path.join(resourcesDir, 'win-settings.json');
fs.writeFileSync(winResFile, JSON.stringify({
  appId: "com.woling.app",
  iconPath: `assets/${iconFile}`
}, null, 2));

console.log('构建环境准备完成'); 