export interface MacroNode {
  id: string;
  label: string;
  labelCode: string;
  position: [number, number, number];
  isHome: boolean;
}

export interface WordCloudDatum {
  text: string;
  weight: number;
}

export interface BeaconAnchorOffset {
  dx: number;
  dy: number;
}

export interface BeaconStyle {
  height: number;
  topRadius: number;
  baseRadius: number;
  opacity: number;
  pulseMaxRadius: number;
  pulseDuration: number;
  color: string;
  activeColor: string;
}

export interface BeaconNodeConfig {
  nodeId: string;
  anchorOffset: BeaconAnchorOffset;
  style?: Partial<BeaconStyle>;
}

export interface BeaconPerfConfig {
  stdDeviationIdle: number;
  stdDeviationActive: number;
  pulseFrequency: number;
  staggerDelay: number;
  reducedMotion: boolean;
}

export const DEFAULT_BEACON_STYLE: BeaconStyle = {
  height: 90,
  topRadius: 2,
  baseRadius: 22,
  opacity: 0.55,
  pulseMaxRadius: 38,
  pulseDuration: 1.8,
  color: "rgba(80, 180, 255, 0.55)",
  activeColor: "rgba(0, 220, 255, 0.9)",
};

export const BEACON_PERF_CONFIG: BeaconPerfConfig = {
  stdDeviationIdle: 2.5,
  stdDeviationActive: 5.0,
  pulseFrequency: 1.8,
  staggerDelay: 0.14,
  reducedMotion: false,
};

export const BEACON_NODE_CONFIGS: BeaconNodeConfig[] = [
  { nodeId: "node-current",    anchorOffset: { dx: -52, dy: -8  } },
  { nodeId: "node-center-red", anchorOffset: { dx: 52,  dy: -8  } },
  { nodeId: "node-2",       anchorOffset: { dx: -4,  dy: 4   } },
  { nodeId: "node-3",       anchorOffset: { dx: 6,   dy: -4  } },
  { nodeId: "node-4",       anchorOffset: { dx: -2,  dy: 6   } },
  { nodeId: "node-5",       anchorOffset: { dx: 4,   dy: -6  } },
];

export const MACRO_NODES: MacroNode[] = [
  { id: "node-current",    label: "图书馆-法律文献区", labelCode: "SECTOR-01", position: [0, 0, 0], isHome: true },
  { id: "node-2",          label: "党史教育中心", labelCode: "SECTOR-02", position: [-8, 0, -6], isHome: false },
  { id: "node-3",          label: "马克思理论教研室", labelCode: "SECTOR-03", position: [8, 0, 2], isHome: false },
  { id: "node-4",          label: "法学教研室", labelCode: "SECTOR-04", position: [-3, 0, 8], isHome: false },
  { id: "node-5",          label: "图书馆-红色经典区", labelCode: "SECTOR-05", position: [5, 0, -4], isHome: false },
  { id: "node-center-red", label: "图书馆-法律文献区", labelCode: "CORE-RED", position: [0, 0, 0], isHome: false },
];

export const DEFAULT_SELECTED_NODE_ID = "node-current";
export const DEFAULT_ACTIVE_SECTOR_ID = "node-current";

/** 每个板块对应的所有 beacon 节点 ID（含红色特殊节点） */
export const SECTOR_NODES: Record<string, string[]> = {
  "node-current": ["node-current", "node-center-red"],
  "node-2":       ["node-2"],
  "node-3":       ["node-3"],
  "node-4":       ["node-4"],
  "node-5":       ["node-5"],
};

export type NodeSelectSource = "plate" | "beacon" | "external_inject";

function buildWordCloudData(words: string[], startWeight = 98, step = 2, minWeight = 30): WordCloudDatum[] {
  const uniqueWords = Array.from(new Set(words.map((item) => item.trim()).filter(Boolean)));
  return uniqueWords.map((text, index) => ({
    text,
    weight: Math.max(minWeight, startWeight - index * step),
  }));
}

const SECURITY_WORDS = [
  "法学期刊",
  "判例汇编",
  "国际条约",
  "法典大全",
  "文献索引",
  "核心期刊",
  "知识产权",
  "域外法",
  "法律评述",
  "卷宗",
  "知识地图",
  "深度检索",
  "知网",
  "学术权威",
  "沉淀",
  "智慧之窗",
  "法律宝库",
  "司法解释",
  "立法沿革",
  "专题法库",
  "法规比对",
  "法条溯源",
  "裁判规则",
  "证据规范",
  "案例检索",
  "学科导航",
  "法学年鉴",
];

const LAOSHANYUAN_WORDS = [
  "法理学",
  "宪法精神",
  "民法典",
  "刑法逻辑",
  "诉讼程序",
  "法律人格",
  "权利义务",
  "判例分析",
  "法律解释",
  "条文研述",
  "法律职业道德",
  "法律实务",
  "实证研究",
  "法治现代化",
  "法律方法论",
  "司法公正",
  "程序正义",
  "权利保障",
  "规范体系",
  "立法技术",
  "法律推理",
  "案例研习",
  "司法适用",
];

const GYM_WORDS = [
  "马克思主义法学",
  "唯物辩证法",
  "社会主义法治",
  "阶级属性",
  "生产关系",
  "思想火炬",
  "真理",
  "实践",
  "辩证统一",
  "意识形态",
  "价值尺度",
  "宣言",
  "群众路线",
  "批判性思维",
  "理论前沿",
  "红色底色",
  "历史唯物主义",
  "人民立场",
  "制度自信",
  "道路自信",
  "理论自信",
  "文化自信",
  "社会实践论",
  "认识论",
  "方法论",
  "时代命题",
];

const REGISTRAR_WORDS = [
  "党内法规",
  "纪律建设",
  "依法执政",
  "建党精神",
  "初心使命",
  "红色基因",
  "自我革命",
  "历史文献",
  "薪火相传",
  "组织纪律",
  "革命遗址",
  "延安精神",
  "红色地标",
  "纪检监察",
  "信仰",
  "忠诚",
  "规矩",
  "党性修养",
  "组织生活",
  "理论学习",
  "作风建设",
  "责任担当",
  "廉政教育",
  "初心教育",
  "党史档案",
  "革命传统",
  "红色传承",
];

const SIMSTREET_WORDS = [
  "智慧司法",
  "电子取证",
  "隐私保护法",
  "AI伦理",
  "数据建模",
  "数字化治理",
  "逻辑架构",
  "区块链存证",
  "信息安全",
  "云端计算",
  "深度学习",
  "自动化规则",
  "交互",
  "安全边界",
  "算法审计",
  "模型治理",
  "联邦学习",
  "知识图谱",
  "数据标签",
  "风险识别",
  "异常检测",
  "多源融合",
  "可解释性",
  "数据合规",
];

const NEW_TEACH_WORDS = [
  "法律英语",
  "模拟法庭",
  "法律文书写作",
  "辩论艺术",
  "跨文化交流",
  "庭审语言",
  "逻辑思辨",
  "表达能力",
  "翻译实务",
  "谈判技巧",
  "控辩交易",
  "法律修辞",
  "沟通桥梁",
  "逻辑闭环",
  "口语表达",
  "即席陈述",
  "法庭礼仪",
  "听辨训练",
  "跨语种检索",
  "译前分析",
  "译后校订",
  "论证结构",
  "观点提炼",
  "证据表达",
];

const LIBRARY_WORDS = [
  "新时代理论",
  "革命传记",
  "峥嵘岁月",
  "英雄史诗",
  "经典诵读",
  "思想文献",
  "薪火",
  "文艺抗争",
  "信仰的力量",
  "红色记忆",
  "历史坐标",
  "沉浸式阅读",
  "书香红色",
  "传世之作",
  "精神谱系",
  "经典导读",
  "红色人物",
  "文献考证",
  "时代回响",
  "历史叙事",
  "读书会",
  "主题书展",
  "红色课堂",
  "文化记忆",
  "精神坐标",
];

export const NODE_WORD_CLOUDS: Record<string, WordCloudDatum[]> = {
  "node-current": buildWordCloudData(SECURITY_WORDS),
  "node-center-red": buildWordCloudData(SECURITY_WORDS),
  "node-2": buildWordCloudData(REGISTRAR_WORDS),
  "node-3": buildWordCloudData(GYM_WORDS),
  "node-4": buildWordCloudData(LAOSHANYUAN_WORDS),
  "node-5": buildWordCloudData(LIBRARY_WORDS),

  "n-simstreet": buildWordCloudData(SIMSTREET_WORDS),
  "n-registrar": buildWordCloudData(REGISTRAR_WORDS),
  "n-gym": buildWordCloudData(GYM_WORDS),
  "n-laoshan": buildWordCloudData(LAOSHANYUAN_WORDS),
  "n-library": buildWordCloudData(LIBRARY_WORDS),
  "n-newteach": buildWordCloudData(NEW_TEACH_WORDS),
};
