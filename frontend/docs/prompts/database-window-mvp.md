# Database Window MVP — Revised English Prompt

> 说明：此文档在原 README 英文提示词基础上，**仅**按需求叙述进行最小改动，未擅自优化叙述语气与设计系统定义。

---

```
<role>
You are an expert frontend engineer, UI/UX designer, visual design specialist, and typography expert. Your goal is to build a "Database Cluster Management Interface" using an existing strict design system.

Before proposing or writing any code, first build a clear mental model of the requirements:
- Identify the tech stack (React, Tailwind CSS, Lucide React).
- Understand the existing "Newsprint" design tokens (zero border-radius, strict black borders, off-white background, high-contrast typography).
- Focus only on the top two sections of the page: The Hero section and the Cluster List section. Do not build anything beyond these two sections.
- Implement functional React state management to make the UI interactive (creating new folders/clusters and updating sidebar metrics).

Always aim to:
- Preserve accessibility and responsive design.
- Maintain absolute visual consistency with the provided "Newsprint" design system.
- Make deliberate, creative design choices that express the design system's personality (brutalist, editorial, structural) instead of producing a generic UI.
</role>

<design-system>
# Design Style: Newsprint

## 1. Design Philosophy
**"All the News That's Fit to Print."**
This style is an ode to the golden age of print journalism, reimagined for the web. It embodies **absolute clarity, hierarchy, and structure** through its unwavering commitment to high-contrast typography, grid-based layouts, and sharp geometric precision.

### Core DNA
- **Stark Geometry**: Zero border radius. Every element is a perfect rectangle with sharp 90-degree corners.
- **High Information Density**: Tight padding, collapsed grid borders, and efficient use of space.
- **Typographic Drama**: Massive serif headlines paired with smaller, highly legible body text.
- **Visible Structure**: Grid lines aren't hidden—they're celebrated. Borders between columns and sections are explicit.
- **Editorial Authority**: Serious, timeless, and trustworthy.

## 2. Design Token System
### Colors (Light Mode Only)
- **Background:** `#F9F9F7` (Newsprint Off-White)
- **Foreground & Borders:** `#111111` (Ink Black)
- **Muted:** `#E5E5E0` (Divider Grey)
- **Accent:** `#CC0000` (Editorial Red) - use extremely sparingly.

### Typography
- **Serif (Headlines):** `'Playfair Display', 'Times New Roman', serif`
- **Serif (Body):** `'Lora', Georgia, serif`
- **Sans-Serif (UI/Labels):** `'Inter', 'Helvetica Neue', sans-serif`
- **Monospace (Data):** `'JetBrains Mono', 'Courier New', monospace`

### Radius & Border
- **Border Radius:** `0px` everywhere. No exceptions.
- **Border Width:** Standard `1px` solid black (`border`, `border-r`, `border-b`). Use `border-b-4` for major section dividers.

### Shadows/Effects
- **Hover Effects:** Hard Offset Shadow: `box-shadow: 4px 4px 0px 0px #111111; transform: translate(-2px, -2px);`
- **No Effects:** No blur, no soft drop shadows, no inner shadows.

### Buttons & Inputs
- **Primary Button:** Solid black background, white text. Hover: white background, black text/border. Sharp corners. Uppercase text with `tracking-widest`.
- **Inputs:** Transparent background, only bottom border (2px solid black), monospace font. No border radius.
</design-system>

<functional-requirements>
# Specific Page Layout & Interactivity

You need to build a single-page React application with the following strict sections and logic:

## 1. Hero Section (Left Column - Main Intro)
- **Headline (H1):** Use the exact Chinese text: "你可以在此新增数据库聚类或向聚类中添加文件". Make it massive (e.g., `text-6xl lg:text-8xl`), using the Serif headline font, with very tight leading (`leading-[0.9]`).
- **Subtext/Decor:** Add a few small decorative paragraphs or metadata tags around the headline using database-related Chinese context (e.g., "数据源管理系统 | v1.0", "高效、结构化、安全的数据聚类引擎"). Use uppercase sans-serif or monospace for these smaller labels to mimic newspaper edition markers.
- **Action Button:** Below the headline, place exactly ONE primary button named "新建聚类" (Create Cluster).

## 2. Interactive Modal (Create Cluster)
- When the "新建聚类" button is clicked, open a brutalist modal overlay.
- The modal must follow the Newsprint style: thick black border, `#F9F9F7` background, 0px border radius, sharp hard shadow (`box-shadow: 8px 8px 0px 0px #111111`).
- It should contain an input field (bottom border only, no radius) for the user to type the new cluster's name, and a "确认创建" (Confirm) button.
- Submitting this form (via button click or Enter key) should add a new cluster object to the React state.
- Include basic client-side validation: reject empty names and names longer than 50 characters.

## 3. Hero Section (Right Sidebar - Dynamic Metrics)
- Create a right sidebar clearly separated from the left column by a vertical black border (`border-l`).
- **Top Part (Stats):** Display exactly three metric rows:
  1. "已有聚类数量" (Total Clusters)
  2. "总文件数量" (Total Files)
  3. "最近添加文件日期" (Last Added Date)
- **Dynamic Logic:** The "已有聚类数量" must be tied to the React state. When a user creates a new cluster via the modal, this number must instantly increment.
- **Bottom Part:** Leave the area below the stats completely empty (do not add any advertisement blocks or extra modules).

## 4. Cluster List Section (Bottom Row Layout)
- Instead of a complex, staggered multi-column card grid, use a strict, minimalist **Single-Column Horizontal Row layout**.
- Map over the clusters in the React state. Each cluster should be rendered as a full-width horizontal bar/row.
- Each row must be separated by a simple horizontal black line (`border-b border-[#111111]`).
- Do not use overlapping cards or side-by-side grids. "一行一个长条" (One long horizontal bar per row).
- Inside each row, display the cluster's name (which the user inputted), an icon (from Lucide React, e.g., `FolderOpen`), and a default file count (e.g., "文件数: 0").
- **Initial State:** Provide 2 or 3 default clusters in the state so the list isn't empty on first load.

## 5. Implementation Rules
- Use React `useState` to manage the `clusters` array and the `isModalOpen` boolean.
- Use Tailwind CSS for all styling, enforcing the `0px` border radius and black/white palette heavily.
- Do not build any footers, sponsors sections, or extra marketing fluff. Stop after the Cluster List section.
- The menu bar must always remain visible regardless of which window is active (except when returning to the login page).
</functional-requirements>
```
