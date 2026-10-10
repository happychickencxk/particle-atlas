#!/usr/bin/env python3
"""Prepare offline type assets and path-reveal SVG headings for PARTICLE ATLAS.

Run with: py -3 scripts/prepare-type.py
All network downloads are pinned to upstream project release branches/files and are
recorded in assets/fonts/SOURCES.md. The generated SVGs require no web font.
"""
from __future__ import annotations

import json
import shutil
import urllib.request
import zipfile
from pathlib import Path

from fontTools import subset
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
FONTS = ASSETS / "fonts"
HEADINGS = ASSETS / "headings"
WORK = ROOT / "scripts" / ".type-cache"

DOWNLOADS = {
    "SourceSerif4Variable-Roman.ttf": "https://raw.githubusercontent.com/adobe-fonts/source-serif/release/VAR/SourceSerif4Variable-Roman.ttf",
    "InterVariable.ttf": "https://raw.githubusercontent.com/rsms/inter/master/docs/font-files/InterVariable.ttf",
    "OFL-SourceSerif4.txt": "https://raw.githubusercontent.com/adobe-fonts/source-serif/release/LICENSE.md",
    "OFL-Inter.txt": "https://raw.githubusercontent.com/rsms/inter/master/LICENSE.txt",
    "OFL-SourceHanSerifSC.txt": "https://raw.githubusercontent.com/adobe-fonts/source-han-serif/release/LICENSE.txt",
}

SOURCE_HAN_RELEASE = "https://github.com/adobe-fonts/source-han-serif/releases/download/2.003R/09_SourceHanSerifSC.zip"

WORDS = ["FORM", "DISTRIBUTION", "SCALE", "EARTH", "TIME", "TERRAIN", "IDENTITY"]

CHINESE_TEXT = """形态，在颗粒中浮现。流畅的弧线、轻薄的金属外壳与柔软的耳垫，让结构与触感成为同一种语言。保留真实产品的外形，仅重新处理光线与材质。每一个点，都是一次观察。鳍肢长度与体重，把三种企鹅的差异留在二维平面上。聚集与疏散由真实测量决定，砂粒只负责让分布被看见。数量，成为可比较的长度。八个人口最多的国家，在同一条尺度上展开。从零开始的条形保留比例，让巨大的数字获得直观的形状。地球的表面，并不平静。一段完整月份里的地震记录，沿经纬度落在球面上。明亮的点标记震中，大小区分震级，转动地球可以看到另一面。时间，留下无法抹去的轨迹。从1880年到2025年，年度温度距平连接成一条真实折线。起伏属于数据，细小的颗粒让时间有了可感知的纹理。大地，在高度之间折叠。富士山的火山锥与周边山脊来自真实高程。倾斜的视角把平面展开为空间，等高线记录每一次高度变化。所有形态，回到一个符号。从物体到数据，从地球到山脊，游离的颗粒在此组成一个共同的标志。许多颗粒，一部图集。旋转 复位 减弱动效 开启动效 数据与来源 查看数据 关闭 返回开头 上一章 下一章 绘制路径 正在加载 无法显示 离线快照 年 月 日 个国家 条记录 有效观测 垂直比例 米 震级 体重 鳍肢长度 温度距平 印度 中国 美国 印度尼西亚 巴基斯坦 尼日利亚 巴西 孟加拉国 数据来源 采集日期 素材改编 国土地理院 原始记录 缺失值 许可证 署名 可用 拖动旋转 左右拖动旋转，上下滑动继续浏览。数据已保存为本地快照，断网仍可查看。像素只改变质感，数据决定形状。"""

def shipped_copy() -> str:
    """Collect actual UI copy and any localised place labels in shipped data.

    The seed string keeps the script independently useful before the page is
    assembled. At build time the generated page, runtime source, and data
    snapshots are included so a later copy edit cannot silently create tofu.
    """
    files = [ROOT / "index.html", ROOT / "src" / "main.js"]
    data_dir = ROOT / "data"
    if data_dir.exists():
        files.extend(path for path in data_dir.rglob("*") if path.suffix.lower() in {".json", ".csv"})
    return CHINESE_TEXT + "".join(path.read_text(encoding="utf-8", errors="ignore") for path in files if path.exists())

# Approximate pen centre lines in an em-square. These are deliberately centre
# strokes (not outline tracing): each is clipped by the authentic Source Serif
# glyph outline and widened enough to cover the finished glyph at dashoffset 0.
SKELETONS = {
    "A": ["M110 0 L350 670 L590 0", "M215 260 L485 260"],
    "B": ["M135 0 L135 670", "M130 670 C700 700 700 360 135 350", "M135 350 C740 360 720 -40 130 0"],
    "C": ["M590 560 C510 690 170 690 105 380 C35 70 510 -50 600 115"],
    "D": ["M130 0 L130 670", "M130 670 C730 680 730 -10 130 0"],
    "E": ["M135 0 L135 670", "M125 670 L560 670", "M135 335 L490 335", "M125 0 L560 0"],
    "F": ["M135 0 L135 670", "M125 670 L565 670", "M135 340 L480 340"],
    "H": ["M135 0 L135 670", "M565 0 L565 670", "M135 340 L565 340"],
    "I": ["M120 670 L520 670", "M320 670 L320 0", "M120 0 L520 0"],
    "L": ["M135 670 L135 0 L555 0"],
    "M": ["M110 0 L110 670 L350 260 L590 670 L590 0"],
    "N": ["M125 0 L125 670 L570 0 L570 670"],
    "O": ["M350 670 C-20 670 -20 0 350 0 C720 0 720 670 350 670"],
    "R": ["M135 0 L135 670", "M130 670 C690 690 690 330 135 340", "M350 340 L600 0"],
    "S": ["M565 555 C470 730 80 660 125 470 C150 335 560 365 570 185 C585 -35 125 -45 80 125"],
    "T": ["M75 670 L605 670", "M340 670 L340 0"],
    "U": ["M135 670 L135 190 C135 -75 565 -75 565 190 L565 670"],
    "Y": ["M95 670 L340 340 L590 670", "M340 340 L340 0"],
}

def download(name: str, url: str) -> Path:
    target = FONTS / name
    if target.exists() and target.stat().st_size > 1000:
        return target
    request = urllib.request.Request(url, headers={"User-Agent": "PARTICLE-ATLAS asset preparation"})
    with urllib.request.urlopen(request, timeout=90) as source, target.open("wb") as dest:
        shutil.copyfileobj(source, dest)
    return target

def path_for_glyph(font: TTFont, letter: str) -> tuple[str, int]:
    glyph_set = font.getGlyphSet()
    cmap = font.getBestCmap()
    name = cmap[ord(letter)]
    pen = SVGPathPen(glyph_set)
    glyph_set[name].draw(pen)
    width = font["hmtx"][name][0]
    return pen.getCommands(), width

def prepare_source_han_subset(copy: str) -> Path:
    """Download the upstream SC release, then retain only this site's glyphs."""
    output = FONTS / "SourceHanSerifSC-AtlasSubset.otf"
    archive = WORK / "SourceHanSerifSC-2.003R.zip"
    if not archive.exists():
        request = urllib.request.Request(SOURCE_HAN_RELEASE, headers={"User-Agent": "PARTICLE-ATLAS asset preparation"})
        with urllib.request.urlopen(request, timeout=180) as source, archive.open("wb") as dest:
            shutil.copyfileobj(source, dest)
    with zipfile.ZipFile(archive) as zf:
        candidate = next(path for path in zf.namelist() if path.endswith("SourceHanSerifSC-Regular.otf"))
        full_font = WORK / "SourceHanSerifSC-Regular.otf"
        if not full_font.exists():
            with zf.open(candidate) as source, full_font.open("wb") as dest:
                shutil.copyfileobj(source, dest)
    options = subset.Options()
    options.name_IDs = [1, 2, 3, 4, 6]
    options.name_legacy = True
    font = TTFont(full_font)
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(text=copy + "0123456789°C×+-./:")
    subsetter.subset(font)
    font.save(output)
    return output

def svg_for_word(font: TTFont, word: str) -> str:
    upm = font["head"].unitsPerEm
    scale = 1000 / upm
    paths, widths = zip(*(path_for_glyph(font, char) for char in word))
    advance = [round(width * scale, 3) for width in widths]
    gap = 22
    positions = []
    cursor = 54
    for width in advance:
        positions.append(cursor)
        cursor += width + gap
    view_width = round(cursor + 40, 3)
    glyph_nodes = []
    pen_nodes = []
    for index, (char, glyph_path, x) in enumerate(zip(word, paths, positions)):
        # Font outlines use y-up; reflect once at the letter group.
        glyph_nodes.append(f'<path d="{glyph_path}" transform="translate({x} 760) scale({scale} {-scale})"/>')
        for d in SKELETONS[char]:
            pen_nodes.append(f'<path class="pen-stroke pen-{index}" pathLength="1" d="{d}" transform="translate({x} 760) scale(1 -1)"/>')
    ident = word.lower()
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {view_width} 820" role="img" aria-labelledby="title-{ident}" data-atlas-heading="{ident}">
  <title id="title-{ident}">{word}</title>
  <defs>
    <mask id="mask-{ident}" maskUnits="userSpaceOnUse" x="0" y="0" width="{view_width}" height="820">
      <rect width="100%" height="100%" fill="#000"/>
      <g fill="none" stroke="#fff" stroke-width="285" stroke-linecap="round" stroke-linejoin="round">{''.join(pen_nodes)}</g>
    </mask>
  </defs>
  <g class="heading-ink" fill="#f2f2f2" mask="url(#mask-{ident})">{''.join(glyph_nodes)}</g>
</svg>'''

def main() -> None:
    FONTS.mkdir(parents=True, exist_ok=True)
    HEADINGS.mkdir(parents=True, exist_ok=True)
    WORK.mkdir(parents=True, exist_ok=True)
    for name, url in DOWNLOADS.items():
        print(f"downloading {name}")
        download(name, url)
    print("downloading and subsetting Source Han Serif SC")
    copy = shipped_copy()
    prepare_source_han_subset(copy)
    # Variable fonts preserve the requested Regular / Light / Medium instances
    # while keeping this direct-open artefact small and locally self-contained.
    metadata = {
        "families": {
            "Source Serif 4": {"file": "SourceSerif4Variable-Roman.ttf", "axes": {"wght": [200, 900]}, "use": "English display titles; 300 Light and 400 Regular"},
            "Inter": {"file": "InterVariable.ttf", "axes": {"wght": [100, 900]}, "use": "data labels; 400 Regular and 500 Medium"},
            "Source Han Serif SC": {"file": "SourceHanSerifSC-AtlasSubset.otf", "use": "Chinese body copy; 400 Regular; subset for the shipped interface copy", "shippedCjkCodepoints": len({ord(char) for char in copy if 0x3400 <= ord(char) <= 0x9fff}), "sources": ["index.html", "src/main.js", "data/**/*.json", "data/**/*.csv"]},
        },
        "headings": [word.lower() for word in WORDS],
        "offline": True,
    }
    (FONTS / "font-manifest.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    (FONTS / "SOURCES.md").write_text("""# Font sources and licence\n\n* Source Serif 4 variable Roman — Adobe, https://github.com/adobe-fonts/source-serif (SIL Open Font License 1.1).\n* Inter variable — Rasmus Andersson, https://github.com/rsms/inter (SIL Open Font License 1.1).\n* Source Han Serif SC Regular — Adobe, https://github.com/adobe-fonts/source-han-serif (SIL Open Font License 1.1). This delivery subsets the upstream 2.003R SC release to the page copy and controls.\n\nThe licence copies in this directory are downloaded from the corresponding upstream repositories. Files are stored locally for direct-open/offline use.\n""", encoding="utf-8")
    source_serif = TTFont(FONTS / "SourceSerif4Variable-Roman.ttf")
    for word in WORDS:
        (HEADINGS / f"{word.lower()}.svg").write_text(svg_for_word(source_serif, word), encoding="utf-8")
    (HEADINGS / "README.md").write_text("""# Path-reveal headings\n\nEach SVG contains real Source Serif 4 filled glyph outlines under an SVG mask. The mask contains wide **centreline pen paths** for every glyph; those paths are clipped naturally by the filled letter outlines. `pathLength=\"1\"`, `stroke-dasharray: 1`, and `stroke-dashoffset: 1` create the initial hidden state.\n\nWhen inline-injected into the page, use:\n\n```css\n.atlas-heading .pen-stroke { stroke-dasharray: 1; stroke-dashoffset: 1; transition: stroke-dashoffset 1.05s cubic-bezier(.22,1,.36,1); }\n.atlas-heading.is-revealed .pen-stroke { stroke-dashoffset: 0; }\n```\n\nStagger `.pen-stroke` by index if desired. Do not use these SVGs as external `<img>` files when animation is required: fetch/embed their text into the DOM, or insert the SVG markup directly. Their intrinsic `viewBox` and title remain available offline.\n""", encoding="utf-8")
    print("Prepared type assets:", FONTS, HEADINGS)

if __name__ == "__main__":
    main()
