# Sources & credits

核验日期：2026-10-10。以下数据均保存本地快照；完整下载 URL、SHA-256 与清洗规则见 `data/manifest.json`。原始文件继续保留，页面不会自动刷新这些来源。

| 章节 | 来源与处理 |
|---|---|
| FORM | Photography by **Daniel Balarezo**, [Pexels photo 11199906](https://www.pexels.com/photo/set-of-white-wireless-headphones-11199906/)。依据 [Pexels 许可](https://www.pexels.com/license/)改编。保留现有产品结构和斜侧视角，经 imagegen 透明去背、银灰金属材质处理与品牌标记清理；随后从 alpha 和亮度采样粒子。没有将现有产品外形宣称为原创设计。原图与改编图仅用于素材追溯，浏览时展示粒子作品。实际工具指令保存在 `assets/product/EDIT-PROMPT.txt`。|
| DISTRIBUTION | [Palmer Penguins](https://allisonhorst.github.io/palmerpenguins/) / Allison Horst, Alison Hill, Kristen Gorman；CC0。原始344条，鳍肢长度与体重同时有效342条：Adelie151、Chinstrap68、Gentoo123。仅排除两条缺测。背景颗粒不是额外观测。|
| SCALE | [World Bank SP.POP.TOTL](https://data.worldbank.org/indicator/SP.POP.TOTL)，结合国家元数据排除地区与收入组聚合项；2025年217个经济体有值。按未舍入数值取前8。API元数据更新日期2026-10-08；页面保存固定读取结果，后续修订不会自行进入成品。|
| EARTH | [USGS Earthquake Catalog](https://earthquake.usgs.gov/fdsnws/event/1/)：2026-09-01T00:00:00Z ≤ time < 2026-10-01T00:00:00Z；eventtype=earthquake；M≥4.5；572事件。并非该月所有小震。陆地与海岸线：[Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/)，公共领域，110m数据。背面事件受深度遮挡，完整记录在表格中保留。|
| TIME | [NASA GISTEMP v4](https://data.giss.nasa.gov/gistemp/)，全球陆地与海洋温度指数年度 J-D 列；1880–2025共146年；1951–1980基准；单位°C。2025为+1.18°C。GISTEMP Team (2026), NASA GISS；Lenssen et al. (2024)。不使用月值冒充完整年度，不平滑年度走势。|
| TERRAIN | [国土地理院高程瓦片](https://maps.gsi.go.jp/development/ichiran.html)，`dem_png`，z12，x3624–3628、y1615–1619，共25张。范围138.56–138.90°E / 35.22–35.50°N。依据国土地理院瓦片加工制作。解码带符号24位厘米高程，缺测掩膜参与插值；投影为WGS84局部切平面，展示256×256规则网格、×2垂直倍率、250m等高线。源采样约31.168m，展示网格约121.824m；DEM采样最高3747.651m，不能将它当作官方富士山峰高。|
| IDENTITY | 原创 P/A 几何标志与 PARTICLE ATLAS 字样。结束语：A world, taking shape. |

## Fonts & software

Source Serif 4 — Adobe；思源宋体SC — Adobe；Inter — Rasmus Andersson。均为本地文件，OFL许可及上游链接保存在 `assets/fonts/`。中文字体为页面文案子集；改写中文文案后应重跑字体准备脚本。

Three.js 0.186.1 与 esbuild 0.28.2 使用 MIT 许可，副本位于 `assets/licenses/`。esbuild只在构建时使用。P/A几何、页面源码、粒子与图表布局在本项目中制作；第三方素材与数据继续遵循各自许可。
