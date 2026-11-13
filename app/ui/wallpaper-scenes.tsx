import type { CSSProperties, ReactNode } from "react";
import styles from "./wallpaper.module.css";

export type SceneId = "dusk" | "aurora" | "ocean" | "city" | "desert" | "fjord";
export type Scene = { id: SceneId; name: string; tone: "night" | "day"; colors: Record<string, string>; running: Record<string, string>; road?: boolean; stars?: boolean; art: ReactNode };

export const ROAD = "M228 320 C222 290 168 276 184 252 C198 232 252 222 236 200 C226 188 206 186 214 176";
const WINDOWS: [number, number][] = [[22, 146], [36, 128], [60, 108], [66, 122], [96, 140], [122, 96], [128, 112], [150, 134], [176, 120], [184, 106], [212, 92], [218, 116], [238, 132], [244, 150], [264, 84], [270, 108], [300, 140], [318, 130], [344, 148], [356, 132], [382, 150]];

/** Six hand-built wallpapers. Each is a sky (colours that blend), drifting light, and one silhouette. */
export const SCENES: Scene[] = [
  {
    id: "dusk", name: "Dusk Hills", tone: "night", road: true, stars: true,
    colors: { "--sky-top": "#090B1C", "--sky-mid": "#1C1638", "--horizon": "#4A2147", "--ember": "#B2452F", "--aura": "#3B2C7A", "--aura-2": "#6A2C5E", "--hill-far": "#2A1E3E", "--hill-mid": "#191329", "--hill-near": "#0E0B18" },
    running: { "--horizon": "#6E2A3A", "--ember": "#E0742F", "--aura-2": "#9A3D3A", "--hill-far": "#3A2236" },
    art: <>
      <path className={styles.far} d="M0 132 Q22 112 44 120 Q66 96 92 108 Q118 70 146 100 Q168 86 188 104 Q214 64 246 98 Q270 84 292 102 Q322 74 352 100 Q378 90 400 106 V320 H0Z"/>
      <path className={styles.haze} d="M0 150 Q100 130 200 148 T400 140 V320 H0Z"/>
      <path className={styles.mid} d="M0 186 Q48 160 104 178 Q160 196 214 170 Q272 146 330 172 Q368 188 400 176 V320 H0Z"/>
      <path className={styles.road} d={ROAD}/>
      <path className={styles.near} d="M0 236 Q70 204 150 228 Q196 242 230 236 Q300 220 400 232 V320 H0Z"/>
    </>,
  },
  {
    id: "aurora", name: "Aurora", tone: "night", stars: true,
    colors: { "--sky-top": "#03101A", "--sky-mid": "#062430", "--horizon": "#0B3A3F", "--ember": "#1FAF8C", "--aura": "#6B3FD1", "--aura-2": "#19C29A", "--hill-far": "#0A2A33", "--hill-mid": "#061C24", "--hill-near": "#030E14" },
    running: { "--ember": "#E0A040", "--aura-2": "#3FD6A0", "--horizon": "#1B3F3A" },
    art: <>
      <path className={styles.ribbon} d="M-20 70 C60 20 120 110 200 60 S330 10 420 60" style={{ stroke: "var(--aura-2)" }}/>
      <path className={`${styles.ribbon} ${styles.ribbonSlow}`} d="M-20 100 C80 60 150 130 230 90 S350 50 420 95" style={{ stroke: "var(--aura)" }}/>
      <path className={styles.far} d="M0 170 L38 128 L62 146 L104 92 L138 140 L170 118 L214 70 L252 128 L290 104 L330 136 L366 110 L400 132 V320 H0Z"/>
      <path className={styles.mid} d="M0 206 L50 172 L92 196 L150 160 L206 200 L262 168 L318 196 L370 176 L400 190 V320 H0Z"/>
      <path className={styles.lake} d="M0 236 H400 V320 H0Z"/>
      <path className={styles.near} d="M0 262 Q90 240 170 258 T400 250 V320 H0Z"/>
    </>,
  },
  {
    id: "ocean", name: "Ocean Dawn", tone: "day",
    colors: { "--sky-top": "#A9BEE8", "--sky-mid": "#E9C6DA", "--horizon": "#FFD1AE", "--ember": "#FFB38A", "--aura": "#C4B5F2", "--aura-2": "#F7B2C9", "--hill-far": "#9FB0D8", "--hill-mid": "#7F93C8", "--hill-near": "#5E72AE" },
    running: { "--sky-top": "#E9C3CF", "--horizon": "#FFC08C", "--ember": "#FF9E5E" },
    art: <>
      <circle className={styles.sun} cx="200" cy="150" r="34"/>
      <path className={styles.sea} d="M0 160 H400 V320 H0Z"/>
      <g className={styles.waves}>
        <path d="M60 182 h80 M230 178 h110 M120 204 h70 M250 214 h60 M30 232 h120 M210 244 h150 M90 270 h90 M260 286 h100"/>
      </g>
      <path className={styles.glint} d="M188 166 h24 M180 176 h40 M184 190 h32 M176 206 h48"/>
    </>,
  },
  {
    id: "city", name: "City Night", tone: "night", stars: false,
    colors: { "--sky-top": "#060A1E", "--sky-mid": "#101A44", "--horizon": "#2B2A6B", "--ember": "#E0558A", "--aura": "#2747B8", "--aura-2": "#8A3FC7", "--hill-far": "#131A3D", "--hill-mid": "#0C1130", "--hill-near": "#070A1E" },
    running: { "--ember": "#FF9A3C", "--aura-2": "#C24A7A", "--horizon": "#4A2A5E" },
    art: <>
      <path className={styles.far} d="M0 170 h18 v-30 h14 v-22 h10 v22 h16 v-48 h22 v48 h12 v-20 h18 v34 h14 v-60 h8 v-14 h6 v14 h8 v60 h18 v-36 h20 v-18 h12 v18 h10 v46 h16 v-70 h24 v70 h14 v-30 h18 v-16 h14 v46 h18 v-42 h20 v42 h12 v-24 h16 v24 V320 H0Z"/>
      <g className={styles.windows}>{WINDOWS.map(([x, y], i) => <rect key={i} x={x} y={y} width="2.4" height="3.2" style={{ animationDelay: `${(i * 0.73) % 7}s` }}/>)}</g>
      <path className={styles.mid} d="M0 214 h30 v-22 h26 v12 h40 v-28 h22 v38 h34 v-18 h30 v26 h38 v-34 h28 v34 h40 v-14 h36 v20 h76 V320 H0Z"/>
      <path className={styles.near} d="M0 250 H400 V320 H0Z"/>
      <path className={styles.roadLine} d="M0 272 H400"/>
    </>,
  },
  {
    id: "desert", name: "Desert Gold", tone: "day", road: true,
    colors: { "--sky-top": "#F2C9A0", "--sky-mid": "#F6D9B0", "--horizon": "#FFE0A8", "--ember": "#FFB060", "--aura": "#F7B9A0", "--aura-2": "#FFD08A", "--hill-far": "#E2A877", "--hill-mid": "#CF8A5A", "--hill-near": "#B06C44" },
    running: { "--ember": "#FF8E3C", "--horizon": "#FFC07A", "--sky-top": "#F0B48A" },
    art: <>
      <circle className={styles.sun} cx="290" cy="112" r="26"/>
      <path className={styles.far} d="M0 150 Q60 128 130 146 Q190 160 250 138 Q320 116 400 140 V320 H0Z"/>
      <path className={styles.mid} d="M0 190 Q80 160 170 186 Q240 204 300 176 Q350 160 400 172 V320 H0Z"/>
      <path className={styles.road} d={ROAD}/>
      <path className={styles.near} d="M0 240 Q110 214 200 236 Q290 254 400 226 V320 H0Z"/>
    </>,
  },
  {
    id: "fjord", name: "Fjord Moon", tone: "night", stars: true,
    colors: { "--sky-top": "#050B18", "--sky-mid": "#0E2142", "--horizon": "#27507A", "--ember": "#5D8FC4", "--aura": "#1C3D7A", "--aura-2": "#3E6EA8", "--hill-far": "#1A3354", "--hill-mid": "#10223D", "--hill-near": "#081325" },
    running: { "--ember": "#E09A50", "--horizon": "#4A4E70", "--aura-2": "#8A6A80" },
    art: <>
      <circle className={styles.moon} cx="290" cy="-150" r="12"/>
      <path className={styles.far} d="M0 120 L46 84 L80 112 L120 60 L160 118 L196 98 L224 116 V320 H0Z"/>
      <path className={styles.far} d="M400 110 L362 70 L320 104 L280 76 L240 120 L210 112 V320 H400Z"/>
      <path className={styles.mist} d="M0 140 Q120 120 200 138 T400 132 V170 H0Z"/>
      <path className={styles.lake} d="M0 172 H400 V320 H0Z"/>
      <path className={styles.moonPath} d="M280 180 h12 M276 192 h20 M272 206 h28 M278 222 h16"/>
      <path className={styles.mid} d="M0 172 L0 120 L30 130 L70 172Z M400 172 L400 126 L366 136 L330 172Z"/>
      <path className={styles.near} d="M0 270 Q60 250 120 262 L160 300 V320 H0Z M400 256 Q340 246 300 270 L270 320 H400Z"/>
    </>,
  },
];


export function sceneStyle(scene: Scene, running: boolean): CSSProperties {
  return { ...scene.colors, ...(running ? scene.running : {}) } as CSSProperties;
}
