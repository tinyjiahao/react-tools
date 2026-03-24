#!/usr/bin/env python3
"""
Knowledge Base Media Downloader (Browser Version)

解析类似 km.txt 的文件，使用真实浏览器下载 image 和 drawio 链接。

使用方法:
    python download_km_media.py <文件路径>

示例:
    python download_km_media.py docs/km.txt
"""

import json
import os
import sys
import time
import urllib.parse
from pathlib import Path
from typing import Dict, List
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

# 配置
DOWNLOAD_TIMEOUT = 30  # 下载超时时间（秒）
PAGE_LOAD_TIMEOUT = 30  # 页面加载超时
IMPLICIT_WAIT = 10  # 隐式等待时间


class KMMediaDownloaderBrowser:
    """使用浏览器下载知识库媒体文件"""

    def __init__(self, file_path: str, output_dir: str = None, headless: bool = False):
        """
        初始化下载器

        Args:
            file_path: km.txt 文件路径
            output_dir: 输出目录，默认为 {file_path}.data
            headless: 是否使用无头模式（不显示浏览器窗口）
        """
        self.file_path = Path(file_path)
        if not self.file_path.exists():
            raise FileNotFoundError(f"文件不存在: {file_path}")

        # 设置输出目录
        if output_dir is None:
            self.output_dir = Path(f"{file_path}.data")
        else:
            self.output_dir = Path(output_dir)

        # 创建子目录
        self.images_dir = self.output_dir / "images"
        self.drawios_dir = self.output_dir / "drawios"

        # 结果统计
        self.results = {
            'images': [],
            'drawios': [],
            'errors': []
        }

        self.headless = headless
        self.driver = None

    def setup_driver(self):
        """设置 Chrome WebDriver"""
        print("🌐 正在启动浏览器...")

        chrome_options = Options()

        # 设置下载目录
        prefs = {
            "download.default_directory": str(self.output_dir.absolute()),
            "download.prompt_for_download": False,
            "download.directory_upgrade": True,
            "safebrowsing.enabled": True,
            "safebrowsing.disable_download_protection": True
        }
        chrome_options.add_experimental_option("prefs", prefs)

        # 无头模式
        if self.headless:
            chrome_options.add_argument("--headless")

        # 其他优化选项
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--window-size=1920,1080")

        # 禁用自动化标志
        chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
        chrome_options.add_experimental_option('useAutomationExtension', False)

        # 创建 WebDriver
        self.driver = webdriver.Chrome(options=chrome_options)
        self.driver.set_page_load_timeout(PAGE_LOAD_TIMEOUT)
        self.driver.implicitly_wait(IMPLICIT_WAIT)

        print("✅ 浏览器启动成功\n")

    def parse_file(self) -> Dict:
        """解析 km.txt 文件"""
        print(f"📖 正在解析文件: {self.file_path}")

        with open(self.file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        # 解析 body 字符串
        body = json.loads(data['data']['body'])

        # 搜索 media 节点
        def search_media_nodes(
            nodes: List,
            depth: int = 0,
            results: Dict = {'images': [], 'drawios': []}
        ) -> Dict:
            """递归搜索 media 节点"""
            for node in nodes:
                if isinstance(node, dict):
                    node_type = node.get('type', '')
                    attrs = node.get('attrs', {})

                    if node_type == 'image':
                        src = attrs.get('src', '')
                        if src:
                            results['images'].append({
                                'src': src,
                                'width': attrs.get('width'),
                                'height': attrs.get('height'),
                                'alt': attrs.get('alt', '')
                            })
                            print(f"  ✅ 找到图片: {src[:80]}...")

                    elif node_type == 'drawio':
                        src = attrs.get('src', '')
                        if src:
                            results['drawios'].append({
                                'src': src,
                                'width': attrs.get('width'),
                                'height': attrs.get('height'),
                                'border': attrs.get('border')
                            })
                            print(f"  ✅ 找到 Drawio: {src[:80]}...")

                    if 'content' in node:
                        search_media_nodes(node['content'], depth + 1, results)

            return results

        results = search_media_nodes(body.get('content', []))
        print(f"\n📊 统计结果:")
        print(f"   图片: {len(results['images'])} 个")
        print(f"   Drawio: {len(results['drawios'])} 个")
        print(f"   总计: {len(results['images']) + len(results['drawios'])} 个\n")

        return results

    @staticmethod
    def extract_filename_from_url(url: str, prefix: str = "") -> str:
        """从 URL 中提取文件名"""
        parsed = urllib.parse.urlparse(url)
        path = parsed.path

        # 从路径中提取文件 ID
        parts = path.split('/')
        if len(parts) >= 2:
            file_id = parts[-1].split('?')[0]

            # 根据查询参数确定扩展名
            query = urllib.parse.parse_qs(parsed.query)
            content_type = query.get('contentType', ['0'])[0]

            if content_type == '1' or 'image' in url.lower():
                ext = '.png'
            else:
                ext = '.drawio.png'

            return f"{prefix}{file_id}{ext}"

        # 如果无法提取，使用时间戳
        return f"{prefix}{int(time.time())}.png"

    def download_with_browser(self, url: str, save_path: Path, desc: str = "下载") -> bool:
        """
        使用浏览器下载文件

        Args:
            url: 下载链接
            save_path: 保存路径
            desc: 描述

        Returns:
            bool: 是否下载成功
        """
        try:
            print(f"     📥 正在下载: {save_path.name}")

            # 访问 URL
            self.driver.get(url)

            # 等待页面加载
            time.sleep(2)

            # 如果是图片直接下载
            # 如果是 drawio，可能需要等待 iframe 加载
            if 'drawio' in url.lower() or 'contentType=0' in url:
                # Drawio 页面，尝试获取图片内容
                # 等待页面元素加载
                time.sleep(3)

                # 尝试通过 JavaScript 获取 SVG 或 Canvas 内容
                try:
                    # 方法1: 尝试找到 SVG 元素
                    svg = self.driver.find_element(By.TAG_NAME, "svg")
                    svg_content = self.driver.execute_script(
                        "return arguments[0].outerHTML;",
                        svg
                    )

                    # 保存 SVG
                    save_path.parent.mkdir(parents=True, exist_ok=True)
                    with open(save_path, 'w', encoding='utf-8') as f:
                        f.write(svg_content)

                    # 如果需要，可以使用 svgexport 转换为 PNG
                    print(f"     ✅ SVG 已保存，可以使用在线工具转换为 PNG")
                    return True

                except Exception as e:
                    # 方法2: 截图
                    print(f"     📸 尝试截图...")

                    # 获取实际内容的尺寸
                    try:
                        body = self.driver.find_element(By.TAG_NAME, "body")
                        size = body.size

                        # 设置窗口大小
                        self.driver.set_window_size(max(1920, size['width']), max(1080, size['height']))

                        # 等待渲染
                        time.sleep(1)

                    except:
                        self.driver.set_window_size(1920, 1080)

                    # 截图
                    save_path.parent.mkdir(parents=True, exist_ok=True)
                    self.driver.save_screenshot(str(save_path))
                    print(f"     ✅ 截图已保存")
                    return True

            else:
                # 普通图片，直接截图当前页面
                save_path.parent.mkdir(parents=True, exist_ok=True)
                self.driver.save_screenshot(str(save_path))
                return True

        except Exception as e:
            print(f"\n  ❌ 下载失败: {url[:80]}")
            print(f"     错误: {str(e)}")
            return False

    def download_all(self, media_data: Dict):
        """下载所有媒体文件"""
        print("📁 准备下载...")
        print("⚠️  提示: 如果需要登录，请在浏览器窗口中手动完成登录\n")

        # 等待用户手动登录（如果需要）
        input("🔐 请在浏览器中完成登录（如需要），然后按 Enter 继续下载...\n")

        # 下载图片
        if media_data['images']:
            print("🖼️  下载图片...")
            self.images_dir.mkdir(parents=True, exist_ok=True)

            for idx, img in enumerate(media_data['images'], 1):
                url = img['src']
                filename = self.extract_filename_from_url(url, f"img_{idx}_")
                save_path = self.images_dir / filename

                print(f"  [{idx}/{len(media_data['images'])}] {filename}")

                if self.download_with_browser(url, save_path, f"图片 {idx}"):
                    self.results['images'].append({
                        'url': url,
                        'path': str(save_path),
                        'status': 'success'
                    })
                else:
                    self.results['errors'].append({
                        'url': url,
                        'error': 'Download failed'
                    })

            print()

        # 下载 drawio
        if media_data['drawios']:
            print("📊 下载 Drawio 图表...")
            self.drawios_dir.mkdir(parents=True, exist_ok=True)

            for idx, dr in enumerate(media_data['drawios'], 1):
                url = dr['src']
                filename = self.extract_filename_from_url(url, f"drawio_{idx}_")
                save_path = self.drawios_dir / filename

                print(f"  [{idx}/{len(media_data['drawios'])}] {filename}")

                if self.download_with_browser(url, save_path, f"Drawio {idx}"):
                    self.results['drawios'].append({
                        'url': url,
                        'path': str(save_path),
                        'status': 'success'
                    })
                else:
                    self.results['errors'].append({
                        'url': url,
                        'error': 'Download failed'
                    })

            print()

    def save_report(self):
        """保存下载报告"""
        report_path = self.output_dir / "download_report.json"

        report = {
            'source_file': str(self.file_path),
            'output_directory': str(self.output_dir),
            'statistics': {
                'total_images': len(self.results['images']),
                'total_drawios': len(self.results['drawios']),
                'total_errors': len(self.results['errors']),
                'total_success': len(self.results['images']) + len(self.results['drawios'])
            },
            'images': self.results['images'],
            'drawios': self.results['drawios'],
            'errors': self.results['errors']
        }

        with open(report_path, 'w', encoding='utf-8') as f:
            json.dump(report, f, ensure_ascii=False, indent=2)

        print(f"📝 下载报告已保存: {report_path}")

    def close(self):
        """关闭浏览器"""
        if self.driver:
            print("🔒 正在关闭浏览器...")
            self.driver.quit()
            print("✅ 浏览器已关闭")

    def run(self):
        """执行完整的下载流程"""
        print("=" * 60)
        print("🎯 知识库媒体文件下载器 (浏览器版)")
        print("=" * 60)
        print()

        try:
            # 设置浏览器
            self.setup_driver()

            # 解析文件
            media_data = self.parse_file()

            if not media_data['images'] and not media_data['drawios']:
                print("⚠️  未找到任何图片或 Drawio 图表")
                return

            # 下载文件
            self.download_all(media_data)

            # 保存报告
            self.save_report()

            # 打印总结
            print("=" * 60)
            print("✅ 下载完成!")
            print(f"   输出目录: {self.output_dir}")
            print(f"   成功: {len(self.results['images']) + len(self.results['drawios'])} 个")
            if self.results['errors']:
                print(f"   失败: {len(self.results['errors'])} 个")
            print("=" * 60)

        except Exception as e:
            print(f"\n❌ 错误: {str(e)}")
            import traceback
            traceback.print_exc()

        finally:
            self.close()


def main():
    """主函数"""
    if len(sys.argv) < 2:
        print("使用方法: python download_km_media.py <文件路径> [输出目录] [--headless]")
        print("\n示例:")
        print("  python download_km_media.py docs/km.txt")
        print("  python download_km_media.py docs/km.txt output/media")
        print("  python download_km_media.py docs/km.txt output/media --headless")
        print("\n注意:")
        print("  - 默认会显示浏览器窗口，方便手动登录")
        print("  - 使用 --headless 参数可以隐藏浏览器窗口")
        print("  - 首次运行前需要: pip install selenium")
        print("  - 还需要安装 ChromeDriver: https://chromedriver.chromium.org/")
        sys.exit(1)

    file_path = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 and not sys.argv[2].startswith('--') else None
    headless = '--headless' in sys.argv

    try:
        downloader = KMMediaDownloaderBrowser(file_path, output_dir, headless)
        downloader.run()
    except Exception as e:
        print(f"❌ 错误: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
