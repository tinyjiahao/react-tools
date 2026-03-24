# 知识库媒体文件下载器

自动解析类似 `km.txt` 的文件，提取其中的图片和 Drawio 图表链接并下载到本地。

## 功能特性

- ✅ 自动解析 JSON 格式的知识库文件
- ✅ 提取 `image` 和 `drawio` 类型的媒体链接
- ✅ 使用浏览器下载（requests 库模拟）
- ✅ 显示下载进度条
- ✅ 自动创建目录结构
- ✅ 生成下载报告（JSON 格式）
- ✅ 错误处理和重试机制

## 安装依赖

```bash
pip install -r requirements.txt
```

或手动安装：

```bash
pip install requests tqdm
```

## 使用方法

### 基本用法

```bash
# 默认输出到 {文件名}.data 目录
python download_km_media.py docs/km.txt

# 指定输出目录
python download_km_media.py docs/km.txt output/media
```

### 输出目录结构

```
docs/km.txt.data/
├── images/              # 图片文件
│   ├── img_1_219690598458.png
│   ├── img_2_219693156558.png
│   └── ...
├── drawios/             # Drawio 图表
│   ├── drawio_1_219693156560.drawio.png
│   ├── drawio_2_219690120448.drawio.png
│   └── ...
└── download_report.json # 下载报告
```

## 输出示例

```
============================================================
🎯 知识库媒体文件下载器
============================================================

📖 正在解析文件: docs/km.txt
  ✅ 找到图片: https://km.sankuai.com/api/file/cdn/...
  ✅ 找到 Drawio: https://km.sankuai.com/api/file/cdn/...

📊 统计结果:
   图片: 5 个
   Drawio: 9 个
   总计: 14 个

📁 准备下载...

🖼️  下载图片...
  [1/5] img_1_219690598458.png
  [2/5] img_2_219693156558.png
  ...

📊  下载 Drawio 图表...
  [1/9] drawio_1_219693156560.drawio.png
  [2/9] drawio_2_219690120448.drawio.png
  ...

============================================================
✅ 下载完成!
   输出目录: docs/km.txt.data
   成功: 14 个
============================================================
```

## 下载报告

生成的 `download_report.json` 包含：

```json
{
  "source_file": "docs/km.txt",
  "output_directory": "docs/km.txt.data",
  "statistics": {
    "total_images": 5,
    "total_drawios": 9,
    "total_errors": 0,
    "total_success": 14
  },
  "images": [
    {
      "url": "https://km.sankuai.com/api/file/cdn/...",
      "path": "docs/km.txt.data/images/img_1_xxx.png",
      "status": "success"
    }
  ],
  "drawios": [...],
  "errors": []
}
```

## 特性说明

### 1. 智能文件命名

- 图片: `img_{序号}_{文件ID}.png`
- Drawio: `drawio_{序号}_{文件ID}.drawio.png`

### 2. 进度显示

使用 `tqdm` 显示实时下载进度：

```
图片 1: 100%|████████████████| 125K/125K [00:02<00:00, 50KB/s]
```

### 3. 错误处理

- 网络超时自动重试
- 失败的链接会记录在报告中
- 不会因为单个文件失败而中断整个下载

### 4. 限流机制

每个下载之间有 0.5 秒延迟，避免请求过快。

## 注意事项

⚠️ **认证要求**: 如果链接需要认证（如美团的内部 API），需要确保：
- 网络环境可以访问这些链接
- 可能需要配置代理或 Cookie
- 或者手动在浏览器中下载

⚠️ **跨域问题**: 某些链接可能有跨域限制，建议在相同网络环境下运行。

## 故障排除

### 问题 1: 导入错误

```
ModuleNotFoundError: No module named 'requests'
```

**解决方案**: 安装依赖
```bash
pip install requests tqdm
```

### 问题 2: 下载失败

如果所有文件都下载失败，可能是：
1. 网络无法访问链接（需要内网 VPN）
2. 需要认证（需要配置请求头）

**解决方案**: 在浏览器中手动测试链接是否可访问

### 问题 3: 文件解析失败

确保输入文件是有效的 JSON 格式，且包含 `data.body` 字段。

## 高级用法

### 自定义请求头

如果需要添加认证信息，可以修改 `download_file` 方法：

```python
headers = {
    'User-Agent': 'Mozilla/5.0...',
    'Authorization': 'Bearer token',
    'Cookie': 'session=...'
}
response = requests.get(url, headers=headers, stream=True)
```

### 并发下载

如果需要加速下载，可以使用 `concurrent.futures` 实现并发。

## 许可

MIT License
