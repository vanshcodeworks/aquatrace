import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import {
  Sun,
  Moon,
  RotateCw,
  RefreshCw,
  Droplets,
  AlertCircle,
  CheckCircle2,
  Send,
  Minimize2,
  Maximize2,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import { useSimulation } from "../../store/SimulationContext";
import { fmtCurrency } from "../../lib/format";

// Sensirion-style Sensor Node Definitions mapped to hotel building zones
export interface TwinNodeDef {
  id: string; // S1 .. S7
  backendId: string; // backend topology id
  name: string;
  subtitle: string;
  location: string;
  pos: [number, number, number];
  parent: string | null;
  baseFlow: number; // nominal L/h
  lo: number; // P10 expected L/h
  hi: number; // P90 expected L/h
  frontDeskNote: string;
  guestRoomInfo: string;
  isTank?: boolean;
}

export const TWIN_NODES: TwinNodeDef[] = [
  {
    id: "S1",
    backendId: "main_inlet",
    name: "Municipal Intake & Pump",
    subtitle: "Basement Utility Room",
    location: "Subterranean Utility Chamber (-2.8m)",
    pos: [-4.6, -2.1, 0.4],
    parent: null,
    baseFlow: 180,
    lo: 120,
    hi: 220,
    frontDeskNote: "Main municipal supply intake and booster pump steady. Pressure 3.6 bar.",
    guestRoomInfo: "Central building utility intake",
  },
  {
    id: "S2",
    backendId: "tank",
    name: "Dual Rooftop Storage Tanks",
    subtitle: "Overhead Reserve Tower",
    location: "Rooftop Scaffolding (+11.8m)",
    pos: [-0.6, 11.8, 0.2],
    parent: null,
    baseFlow: 82, // Base storage capacity percentage
    lo: 40,
    hi: 100,
    frontDeskNote: "Water reserve at 82% capacity. Safety buffer: 6.5 hours of emergency supply.",
    guestRoomInfo: "50,000L Overhead Dual Reserve",
    isTank: true,
  },
  {
    id: "S3",
    backendId: "wing_a",
    name: "Wing A Suites (West)",
    subtitle: "Rooms 101–103 & 201–203",
    location: "West Guest Wing (+4.5m)",
    pos: [-5.8, 4.4, -1.8],
    parent: "S1",
    baseFlow: 430,
    lo: 280,
    hi: 540,
    frontDeskNote: "All guest suites in West Wing reporting normal morning shower & tap demand.",
    guestRoomInfo: "Suites 101–103, 201–203",
  },
  {
    id: "S4",
    backendId: "wing_b",
    name: "Wing B Suites (East)",
    subtitle: "Rooms 104–106 & 204–206",
    location: "East Guest Wing (+4.5m)",
    pos: [5.2, 4.4, -1.8],
    parent: "S1",
    baseFlow: 480,
    lo: 300,
    hi: 570,
    frontDeskNote: "Main distribution riser to East Wing suites. Telemetry nominal.",
    guestRoomInfo: "Suites 104–106, 204–206",
  },
  {
    id: "S5",
    backendId: "kitchen",
    name: "Commercial Kitchen",
    subtitle: "Basement Culinary Annex",
    location: "Commercial Kitchen (-1.8m)",
    pos: [1.8, -1.6, 2.2],
    parent: "S1",
    baseFlow: 210,
    lo: 150,
    hi: 280,
    frontDeskNote: "Kitchen prep sinks, combi-steamers and scullery dishwashers running normally.",
    guestRoomInfo: "Subterranean Kitchen & Scullery",
  },
  {
    id: "S6",
    backendId: "laundry",
    name: "Hotel Laundry Facility",
    subtitle: "Basement Wash Room",
    location: "Commercial Washers (-1.8m)",
    pos: [7.2, -1.6, 2.2],
    parent: "S1",
    baseFlow: 360,
    lo: 220,
    hi: 440,
    frontDeskNote: "4 Commercial front-load washers operating on scheduled daily linen turnover.",
    guestRoomInfo: "Front-load Washers 1–4",
  },
  {
    id: "S7",
    backendId: "floor_b2",
    name: "Floor 2 · Suite 206",
    subtitle: "Upper East Wing Fixture",
    location: "2nd Floor East Corridor (+7.5m)",
    pos: [6.8, 7.5, -1.8],
    parent: "S4",
    baseFlow: 155,
    lo: 70,
    hi: 190,
    frontDeskNote: "Floor 2 guest fixture feed is steady. Nominal water draw across suites.",
    guestRoomInfo: "Focus: Room 206 Bathroom Fixture",
  },
];

interface NodeLiveState {
  id: string;
  name: string;
  subtitle: string;
  live: number;
  lo: number;
  hi: number;
  state: "normal" | "warning" | "leak";
  inherited: boolean;
  simulated: boolean;
  frontDeskNote: string;
  excess: number;
}

export function DigitalTwin3D({
  compact = false,
  showInspector = true,
}: {
  compact?: boolean;
  showInspector?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Simulation Context
  const { latest, state: simState, injectFault, remediation, step, start, connected } = useSimulation();

  // Selected sensor node (defaults to S7 for instant front desk demo)
  const [selectedNodeId, setSelectedNodeId] = useState<string>("S7");

  // Visual & Camera States
  const [isNight, setIsNight] = useState<boolean>(false);
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [focusedFloor, setFocusedFloor] = useState<string>("all");
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);

  // Simulation controls state
  const [simulatedLeak, setSimulatedLeak] = useState<boolean>(false);
  const [tankOverflow, setTankOverflow] = useState<boolean>(false);
  const [halfLaundry, setHalfLaundry] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [dispatchAlertSent, setDispatchAlertSent] = useState<boolean>(false);

  // Projected 2D pin positions for in-canvas floating badges
  const [projectedPins, setProjectedPins] = useState<
    Record<string, { x: number; y: number; visible: boolean }>
  >({});

  // Nodes Live State
  const [nodesData, setNodesData] = useState<Record<string, NodeLiveState>>(() => {
    const map: Record<string, NodeLiveState> = {};
    TWIN_NODES.forEach((n) => {
      map[n.id] = {
        id: n.id,
        name: n.name,
        subtitle: n.subtitle,
        live: n.isTank ? 82 : n.baseFlow,
        lo: n.lo,
        hi: n.hi,
        state: "normal",
        inherited: false,
        simulated: false,
        frontDeskNote: n.frontDeskNote,
        excess: 0,
      };
    });
    return map;
  });

  // Sound generator
  const playSound = useCallback(
    (type: "beep" | "alert" | "click") => {
      if (!soundEnabled || typeof window === "undefined") return;
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        if (type === "alert") {
          osc.type = "sine";
          osc.frequency.setValueAtTime(540, ctx.currentTime);
          osc.frequency.exponentialRampToValueAtTime(270, ctx.currentTime + 0.22);
          gain.gain.setValueAtTime(0.06, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
          osc.start();
          osc.stop(ctx.currentTime + 0.22);
        } else if (type === "beep") {
          osc.type = "sine";
          osc.frequency.setValueAtTime(800, ctx.currentTime);
          gain.gain.setValueAtTime(0.04, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
          osc.start();
          osc.stop(ctx.currentTime + 0.1);
        } else {
          osc.type = "triangle";
          osc.frequency.setValueAtTime(550, ctx.currentTime);
          gain.gain.setValueAtTime(0.02, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
          osc.start();
          osc.stop(ctx.currentTime + 0.04);
        }
      } catch {
        /* audio disabled */
      }
    },
    [soundEnabled]
  );

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2800);
  }, []);

  // Update nodes data when live backend telemetry arrives
  useEffect(() => {
    if (!latest?.nodes) return;
    setNodesData((prev) => {
      const next = { ...prev };
      let anyChanged = false;

      TWIN_NODES.forEach((tn) => {
        const backendNode = latest.nodes[tn.backendId];
        const current = next[tn.id];
        if (!current) return;

        if (tn.isTank) {
          const tankPct = simState?.tank_level_pct ?? 82;
          next[tn.id] = {
            ...current,
            live: tankPct,
            lo: 40,
            hi: 100,
            state: tankPct < 30 ? "leak" : tankPct < 50 ? "warning" : "normal",
            frontDeskNote: `Overhead water reserve at ${Math.round(tankPct)}% capacity (${Math.round(tankPct * 500).toLocaleString()} L). Gravity head steady.`,
            excess: 0,
          };
          anyChanged = true;
          return;
        }

        if (backendNode) {
          const liveLph = backendNode.actual !== null && backendNode.actual !== undefined ? backendNode.actual * 4 : tn.baseFlow;
          const loLph = backendNode.lower * 4;
          const hiLph = backendNode.upper * 4;
          const stateStr = backendNode.detector_state;

          let mappedState: "normal" | "warning" | "leak" = "normal";
          if (stateStr === "CRITICAL") mappedState = "leak";
          else if (stateStr === "WARNING" || stateStr === "WATCH") mappedState = "warning";

          let note = tn.frontDeskNote;
          if (backendNode.evidence?.length) {
            note = backendNode.evidence.join(". ");
          } else if (mappedState === "leak") {
            note = "Continuous excess flow detected (+185 L/h). Suspected toilet flapper or open fixture.";
          }

          next[tn.id] = {
            ...current,
            live: Math.round(liveLph),
            lo: Math.round(loLph),
            hi: Math.round(hiLph),
            state: mappedState,
            frontDeskNote: note,
            excess: backendNode.excess_lph || 0,
          };
          anyChanged = true;
        }
      });

      // Hydraulic upstream riser propagation
      if (next.S7?.state === "leak") {
        next.S4 = { ...next.S4, inherited: true };
        next.S1 = { ...next.S1, inherited: true };
      } else if (next.S4?.state === "leak") {
        next.S1 = { ...next.S1, inherited: true };
      } else {
        next.S4 = { ...next.S4, inherited: false };
        next.S1 = { ...next.S1, inherited: false };
      }

      return anyChanged ? next : prev;
    });
  }, [latest, simState?.tank_level_pct]);

  // Gentle replay oscillations ONLY when backend is disconnected
  useEffect(() => {
    if (connected && latest?.nodes) return; // Do not overwrite active backend telemetry!

    let tickCount = 0;
    const interval = setInterval(() => {
      tickCount++;
      setNodesData((prev) => {
        const next = { ...prev };
        TWIN_NODES.forEach((tn, i) => {
          const node = next[tn.id];
          if (!node || node.simulated || tn.isTank) return;

          const harmonic = 1 + 0.035 * Math.sin(tickCount * 0.4 + i * 1.5) + 0.015 * Math.sin(tickCount * 0.18 + i);
          const liveFlow = Math.round(tn.baseFlow * harmonic);

          next[tn.id] = {
            ...node,
            live: liveFlow,
          };
        });

        if (simulatedLeak && next.S7) {
          next.S7 = {
            ...next.S7,
            live: 395,
            state: "leak",
            excess: 240,
            frontDeskNote: "⚠️ Continuous fixture draw in Room 206 (+240 L/h). Suspected toilet flapper leak.",
          };
          next.S4 = { ...next.S4, live: 720, inherited: true };
          next.S1 = { ...next.S1, live: 420, inherited: true };
        }

        return next;
      });
    }, 1800);

    return () => clearInterval(interval);
  }, [connected, latest, simulatedLeak]);

  // Three.js References
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const targetPosRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 4.2, 0));
  const currentLookAtRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 4.2, 0));
  // Exact isometric perspective matching user reference image
  const sphericalRef = useRef<THREE.Spherical>(new THREE.Spherical(46, 1.05, 0.76));
  const targetSphericalRef = useRef<THREE.Spherical>(new THREE.Spherical(46, 1.05, 0.76));
  const sensorGroupsRef = useRef<Record<string, THREE.Group>>({});
  const materialsRef = useRef<Record<string, any>>({});
  const segmentsRef = useRef<Record<string, { id: string; a: THREE.Vector3; b: THREE.Vector3; mesh: THREE.Mesh }>>({});
  const particlesRef = useRef<{ mesh: THREE.Mesh; segment: string; t: number; baseSpeed: number }[]>([]);
  const ultrasonicBeaconRef = useRef<THREE.Mesh | null>(null);
  const dirSunRef = useRef<THREE.DirectionalLight | null>(null);
  const hemiLightRef = useRef<THREE.HemisphereLight | null>(null);
  const tankWaterRef = useRef<THREE.Mesh[]>([]);
  const tankLevelRef = useRef<number>(0.8);
  const pulseStateRef = useRef<{ path: string[]; index: number; timer: number }>({ path: [], index: 0, timer: 0 });

  // Keep the in-tank water fill in sync with the live reserve reading.
  useEffect(() => {
    const lvl = nodesData.S2?.live ?? 80;
    tankLevelRef.current = Math.max(0.04, Math.min(1, lvl / 100));
  }, [nodesData]);

  useEffect(() => {
    if (simulatedLeak || nodesData.S7?.state === "leak") {
      pulseStateRef.current = {
        path: ["main_riser", "wingB_f2_pipe"],
        index: 0,
        timer: 0,
      };
    } else {
      pulseStateRef.current = { path: [], index: 0, timer: 0 };
    }
  }, [simulatedLeak, nodesData.S7?.state]);

  // Master Three.js Scene Construction
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // 1. Scene & Studio Lighting Environment
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Physically-inspired sky dome (vertical gradient). Replaces the flat background
    // so PBR glass and steel have something believable to reflect at the horizon.
    const skyTop = new THREE.Color(isNight ? "#0b1220" : "#3f83d6");
    const skyMid = new THREE.Color(isNight ? "#1e293b" : "#8fc3f0");
    const skyBottom = new THREE.Color(isNight ? "#334155" : "#eef2f6");
    const skyGeo = new THREE.SphereGeometry(150, 32, 24);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: skyTop },
        midColor: { value: skyMid },
        bottomColor: { value: skyBottom },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vWorldPos;
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 bottomColor;
        void main() {
          float h = clamp(normalize(vWorldPos).y * 0.5 + 0.5, 0.0, 1.0);
          vec3 col = h < 0.5
            ? mix(bottomColor, midColor, smoothstep(0.0, 0.5, h))
            : mix(midColor, topColor, smoothstep(0.5, 1.0, h));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.name = "SkyDome";
    scene.add(sky);

    scene.background = skyBottom.clone();
    scene.fog = new THREE.FogExp2(isNight ? "#1b2536" : "#dbe7f5", isNight ? 0.011 : 0.0065);

    // 2. Camera with isometric lens angle matching image
    const camera = new THREE.PerspectiveCamera(36, container.clientWidth / container.clientHeight, 0.1, 200);
    cameraRef.current = camera;
    camera.position.setFromSpherical(sphericalRef.current).add(targetPosRef.current);
    camera.lookAt(targetPosRef.current);

    // 3. WebGL Renderer with Soft PCF Shadows
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    rendererRef.current = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(container.clientWidth, container.clientHeight, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Filmic tone mapping gives the physically-based materials a photographic falloff
    // instead of the flat, clipped look of the default linear output.
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = isNight ? 1.15 : 1.0;

    // Image-based lighting: a neutral studio environment baked to a PMREM cubemap.
    // This drives realistic reflections on glass, water and brushed steel.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = environment.texture;
    pmrem.dispose();

    // 4. Lighting: warm key sun from upper-left, cool sky fill, blue rim (matching the photo).
    // The PMREM environment already supplies soft ambient, so direct lights stay moderate.
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xcdd9e5, isNight ? 0.35 : 0.7);
    hemiLightRef.current = hemiLight;
    scene.add(hemiLight);

    const sun = new THREE.DirectionalLight(0xfff4e6, isNight ? 1.6 : 2.6);
    sun.position.set(-24, 38, 26);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 120;
    sun.shadow.camera.left = -28;
    sun.shadow.camera.right = 28;
    sun.shadow.camera.top = 28;
    sun.shadow.camera.bottom = -28;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 3.5;
    dirSunRef.current = sun;
    scene.add(sun);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, isNight ? 0.6 : 0.85);
    rimLight.position.set(22, 18, -20);
    scene.add(rimLight);

    // 5. Physically-based architectural materials.
    //    Standard materials handle the matte surfaces; Physical materials give real
    //    refraction (transmission/ior/thickness) to glass and stored water.
    const makeNoiseTexture = (contrast = 0.5, repeat = 6) => {
      const size = 256;
      const cv = document.createElement("canvas");
      cv.width = cv.height = size;
      const ctx = cv.getContext("2d");
      if (!ctx) return null;
      const img = ctx.createImageData(size, size);
      for (let i = 0; i < img.data.length; i += 4) {
        const n = 128 + (Math.random() - 0.5) * 255 * contrast;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = n;
        img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      const tex = new THREE.CanvasTexture(cv);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeat, repeat);
      tex.anisotropy = 4;
      return tex;
    };
    const concreteRough = makeNoiseTexture(0.3);
    const concreteBump = makeNoiseTexture(0.65);
    const stoneRough = makeNoiseTexture(0.75, 4);

    const mat = (color: string, opts: THREE.MeshStandardMaterialParameters = {}) =>
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.8,
        metalness: 0.04,
        envMapIntensity: 1.0,
        ...opts,
      });

    const glassMat = (color: string, opts: THREE.MeshPhysicalMaterialParameters = {}) =>
      new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.04,
        metalness: 0,
        transmission: 0.92,
        thickness: 0.5,
        ior: 1.48,
        transparent: true,
        opacity: 0.55,
        envMapIntensity: 1.6,
        ...opts,
      });

    const liquidMat = (color: string, opts: THREE.MeshPhysicalMaterialParameters = {}) =>
      new THREE.MeshPhysicalMaterial({
        color,
        roughness: 0.06,
        metalness: 0,
        transmission: 0.82,
        thickness: 1.4,
        ior: 1.33,
        transparent: true,
        opacity: 0.9,
        envMapIntensity: 1.4,
        ...opts,
      });

    const M = {
      concreteWall: mat(isNight ? "#2a394b" : "#ffffff", {
        roughness: 0.85,
        roughnessMap: concreteRough ?? undefined,
        bumpMap: concreteBump ?? undefined,
        bumpScale: 0.02,
      }),
      interiorWall: mat(isNight ? "#233145" : "#ffffff", { roughness: 0.92 }),
      floorSlab: mat(isNight ? "#1b2740" : "#e2e8f0", { roughness: 0.55, metalness: 0.08, envMapIntensity: 1.1 }),
      roofSlab: mat(isNight ? "#334155" : "#dfe6ee", { roughness: 0.6, roughnessMap: concreteRough ?? undefined }),
      foundationEarth: mat(isNight ? "#334155" : "#c7d0dc", { roughness: 0.98, roughnessMap: stoneRough ?? undefined }),
      retainingStone: mat(isNight ? "#475569" : "#c4cdd8", {
        roughness: 0.95,
        roughnessMap: stoneRough ?? undefined,
        bumpMap: stoneRough ?? undefined,
        bumpScale: 0.05,
      }),
      woodLouver: mat("#9a6036", { roughness: 0.55 }),
      bedWood: mat("#78350f", { roughness: 0.45, envMapIntensity: 0.9 }),
      linen: mat(isNight ? "#cbd5e1" : "#ffffff", { roughness: 0.95 }),
      stainlessSteel: mat("#cbd5e1", { metalness: 0.95, roughness: 0.22, envMapIntensity: 1.5 }),
      diningWood: mat("#b45309", { roughness: 0.5 }),
      balconyGlass: glassMat("#cfe9ff", { opacity: 0.35, thickness: 0.2 }),
      waterTankTranslucent: glassMat("#e0f2fe", { opacity: 0.5, thickness: 0.3, roughness: 0.05 }),
      waterTankCap: mat("#38bdf8", { roughness: 0.25, metalness: 0.35, envMapIntensity: 1.3 }),
      pipeBlue: mat("#0a84d8", { roughness: 0.22, metalness: 0.35, envMapIntensity: 1.3 }),
      pipeAlert: mat("#ef4444", { roughness: 0.2, metalness: 0.15, emissive: "#7f1d1d", emissiveIntensity: 0.4 }),
      waterSumpBlue: liquidMat("#38bdf8", { opacity: 0.85 }),
      greenBush: mat("#166534", { roughness: 0.9 }),
      sensorEnclosure: mat("#f8fafc", { roughness: 0.28, metalness: 0.1 }),
      greenLed: mat("#10b981", { emissive: "#047857", emissiveIntensity: 1.2, roughness: 0.3 }),
      amberLed: mat("#f59e0b", { emissive: "#d97706", emissiveIntensity: 1.3, roughness: 0.3 }),
      redLed: mat("#ef4444", { emissive: "#b91c1c", emissiveIntensity: 1.5, roughness: 0.3 }),
    };
    materialsRef.current = M;

    const root = new THREE.Group();
    root.name = "HillHotel_CrossSection";
    scene.add(root);

    function box(
      parent: THREE.Object3D,
      name: string,
      pos: [number, number, number],
      size: [number, number, number],
      material: THREE.Material
    ) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
      mesh.name = name;
      mesh.position.set(...pos);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    }

    function cyl(
      parent: THREE.Object3D,
      name: string,
      a: [number, number, number],
      b: [number, number, number],
      r: number,
      material: THREE.Material,
      radial = 12
    ) {
      const A = new THREE.Vector3(...a);
      const B = new THREE.Vector3(...b);
      const d = B.clone().sub(A);
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), radial, 1), material);
      mesh.name = name;
      mesh.position.copy(A.add(B).multiplyScalar(0.5));
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    }

    // 6. Subterranean Earth Cross-Section Foundation
    box(root, "Bedrock_Base", [0, -4.2, 0], [24, 2.4, 12], M.foundationEarth);

    // Grounded terrain disc so the cutaway reads as sitting on real ground and
    // catches the sun's shadows instead of floating in a void.
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(90, 64),
      mat(isNight ? "#22304a" : "#dde6f0", { roughness: 1.0, metalness: 0 })
    );
    ground.name = "Terrain_Ground";
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -5.42;
    ground.receiveShadow = true;
    root.add(ground);

    // Soft radial contact shadow baked to a texture (fake AO under the building).
    const contactCv = document.createElement("canvas");
    contactCv.width = contactCv.height = 256;
    const contactCtx = contactCv.getContext("2d");
    if (contactCtx) {
      const grad = contactCtx.createRadialGradient(128, 128, 14, 128, 128, 128);
      grad.addColorStop(0, "rgba(15,23,42,0.55)");
      grad.addColorStop(0.6, "rgba(15,23,42,0.18)");
      grad.addColorStop(1, "rgba(15,23,42,0)");
      contactCtx.fillStyle = grad;
      contactCtx.fillRect(0, 0, 256, 256);
      const contact = new THREE.Mesh(
        new THREE.PlaneGeometry(36, 24),
        new THREE.MeshBasicMaterial({
          map: new THREE.CanvasTexture(contactCv),
          transparent: true,
          depthWrite: false,
          opacity: isNight ? 0.6 : 0.45,
        })
      );
      contact.name = "Contact_Shadow";
      contact.rotation.x = -Math.PI / 2;
      contact.position.set(0, -5.4, 0);
      root.add(contact);
    }
    // Hillside stone retaining wall on the left
    box(root, "Retaining_Wall_Left", [-10.8, -1.8, 0], [2.4, 3.2, 12], M.retainingStone);
    for (let si = 0; si < 5; si++) {
      const stoneMesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7 + (si % 3) * 0.2), M.retainingStone);
      stoneMesh.position.set(-11.4 + (si % 2) * 0.4, -2.4 + si * 0.9, -4 + si * 2);
      stoneMesh.castShadow = true;
      root.add(stoneMesh);
    }
    // Hillside pine shrubs
    for (let pi = 0; pi < 6; pi++) {
      const bush = new THREE.Mesh(new THREE.SphereGeometry(0.55 + (pi % 2) * 0.25, 10, 8), M.greenBush);
      bush.position.set(pi < 3 ? -11.8 : 11.5, pi < 3 ? 0.2 + pi * 0.6 : -1.8 + pi * 0.8, -4 + pi * 1.8);
      bush.scale.set(1, 1.4, 1);
      bush.castShadow = true;
      root.add(bush);
    }

    // 7. Three Main Floors Slabs & Exterior Architectural Framing
    // Slabs: Basement Floor, Ground Floor, Floor 1, Floor 2, Roof Slab
    box(root, "Basement_Slab", [0, -3.0, 0], [20.6, 0.24, 9.6], M.floorSlab);
    box(root, "Ground_Slab", [0, 0.0, 0], [20.6, 0.28, 9.6], M.floorSlab);
    box(root, "Floor1_Slab", [0, 3.0, 0], [20.6, 0.28, 9.6], M.floorSlab);
    box(root, "Floor2_Slab", [0, 6.0, 0], [20.6, 0.28, 9.6], M.floorSlab);
    box(root, "Roof_Slab", [0, 9.0, 0], [20.6, 0.35, 9.6], M.roofSlab);
    // Roof Parapets
    box(root, "Parapet_Back", [0, 9.4, 4.65], [20.6, 0.5, 0.2], M.concreteWall);
    box(root, "Parapet_Left", [-10.2, 9.4, 0], [0.2, 0.5, 9.6], M.concreteWall);
    box(root, "Parapet_Right", [10.2, 9.4, 0], [0.2, 0.5, 9.6], M.concreteWall);

    // Rear Solid Walls & Central Stair Core Walls (leaving the FRONT open as in the cutaway picture!)
    box(root, "Back_Wall", [0, 3.0, 4.6], [20.6, 12.2, 0.3], M.concreteWall);

    // Facade glazing: grid of recessed windows on both faces of the rear wall
    const frameMat = mat(isNight ? "#0f172a" : "#334155", { roughness: 0.5, metalness: 0.4 });
    const paneMat = M.balconyGlass.clone();
    paneMat.side = THREE.DoubleSide;
    for (const wz of [4.42, 4.78]) {
      for (const wy of [1.5, 4.5, 7.5]) {
        for (let wx = -8.4; wx <= 8.5; wx += 2.4) {
          box(root, `Window_Frame_${wx}_${wy}_${wz}`, [wx, wy, wz], [1.5, 1.9, 0.06], frameMat);
          const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.28, 1.66), paneMat);
          pane.position.set(wx, wy, wz + (wz > 4.6 ? 0.04 : -0.04));
          root.add(pane);
        }
      }
    }
    box(root, "Stair_Wall_Left", [-1.5, 3.0, 0], [0.2, 12.2, 9.2], M.interiorWall);
    box(root, "Stair_Wall_Right", [1.5, 3.0, 0], [0.2, 12.2, 9.2], M.interiorWall);

    // 8. Open Staircase in Central Core with Glass Balustrades
    for (let f = 0; f < 3; f++) {
      const baseY = f * 3;
      for (let st = 0; st < 6; st++) {
        const step = box(
          root,
          `Stair_${f}_${st}`,
          [0, baseY + 0.3 + st * 0.45, -2.6 + st * 0.85],
          [2.6, 0.16, 0.6],
          M.floorSlab
        );
        step.rotation.z = -0.01;
      }
      // Glass railing on stairs
      box(root, `Railing_Glass_${f}`, [1.25, baseY + 1.5, 0], [0.04, 1.2, 4.2], M.balconyGlass);
    }

    // 9. Subterranean Level (-3.0m to 0.0m)
    // Left side: Underground Plant Room with Booster Pump & Big Blue Sump Tank
    box(root, "Sump_Tank_Concrete", [-5.2, -2.2, 1.5], [4.4, 1.4, 3.2], M.concreteWall);
    // Blue water inside the sump
    box(root, "Sump_Water_Body", [-5.2, -2.1, 1.5], [4.1, 1.15, 2.9], M.waterSumpBlue);
    // Booster Pump Unit
    box(root, "Pump_Base", [-8.2, -2.85, 0.4], [1.4, 0.3, 1.0], M.stainlessSteel);
    cyl(root, "Pump_Motor", [-8.2, -2.5, 0.4], [-8.2, -2.0, 0.4], 0.35, M.stainlessSteel);
    cyl(root, "Pump_Impeller", [-7.4, -2.5, 0.4], [-7.4, -2.5, 0.4], 0.42, M.stainlessSteel);
    // Municipal Inlet Flange Pipe entering from wall
    cyl(root, "Municipal_Intake_Pipe", [-10.2, -2.5, 0.4], [-8.4, -2.5, 0.4], 0.14, M.pipeBlue);

    // Right side subterranean: Commercial Kitchen & Laundry Annex
    // Kitchen prep island
    box(root, "Kitchen_Island", [3.2, -2.4, 1.5], [2.8, 0.9, 1.2], M.stainlessSteel);
    // Kitchen commercial cooktop & range
    box(root, "Kitchen_Stove_Range", [5.2, -2.4, 3.6], [3.2, 0.9, 0.9], M.stainlessSteel);
    // Overhead commercial extraction hood
    box(root, "Kitchen_Exhaust_Hood", [5.2, -0.6, 3.6], [3.4, 0.4, 1.0], M.stainlessSteel);
    // Laundry Annex: 4 Front-load Commercial Washers
    for (let wi = 0; wi < 4; wi++) {
      const wx = 7.4 + wi * 0.85;
      box(root, `Washer_${wi}`, [wx, -2.3, 2.2], [0.72, 1.1, 0.78], M.sensorEnclosure);
      // Washer porthole door glass
      const glassDoor = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 16), M.balconyGlass);
      glassDoor.rotation.x = Math.PI / 2;
      glassDoor.position.set(wx, -2.3, 1.78);
      root.add(glassDoor);
    }

    // 10. Ground Floor (0.0m to 3.0m)
    // Left wing: Hotel Guest Suites
    // Right wing: Hotel Restaurant & Dining Area with Tables and Chairs
    for (let ti = 0; ti < 2; ti++) {
      const tx = 4.8 + ti * 3.4;
      // Dining table
      box(root, `Dining_Table_${ti}`, [tx, 0.75, 0.5], [1.8, 0.1, 1.0], M.diningWood);
      box(root, `Table_Leg_${ti}_L`, [tx - 0.7, 0.35, 0.5], [0.08, 0.7, 0.08], M.stainlessSteel);
      box(root, `Table_Leg_${ti}_R`, [tx + 0.7, 0.35, 0.5], [0.08, 0.7, 0.08], M.stainlessSteel);
      // Chairs around table
      for (const side of [-0.7, 0.7]) {
        box(root, `Chair_${ti}_${side}`, [tx + side * 0.6, 0.42, 0.5], [0.38, 0.65, 0.38], M.diningWood);
      }
    }
    // Restaurant buffet / service counter
    box(root, "Resto_Buffet_Counter", [7.5, 0.85, 3.8], [3.2, 0.95, 0.75], M.bedWood);

    // 11. Floors 1 & 2: Detailed Hotel Guest Suites
    // In every suite: Bed with wooden headboard, white duvet, pillows, bathroom with toilet
    function buildGuestSuite(wing: "A" | "B", floor: number) {
      const y = floor * 3.0;
      const x = wing === "A" ? -5.8 : 5.8;

      // Wooden Bed Headboard
      box(root, `Suite_Headboard_${wing}_F${floor}`, [x - 1.6, y + 1.1, 1.2], [0.15, 1.4, 2.2], M.bedWood);
      // Bed Base
      box(root, `Suite_BedBase_${wing}_F${floor}`, [x - 0.6, y + 0.35, 1.2], [1.8, 0.45, 1.9], M.bedWood);
      // White Duvet & Linen
      box(root, `Suite_Duvet_${wing}_F${floor}`, [x - 0.4, y + 0.55, 1.2], [1.4, 0.25, 1.8], M.linen);
      // Pillows
      box(root, `Suite_Pillow_${wing}_F${floor}`, [x - 1.3, y + 0.7, 1.2], [0.35, 0.12, 1.4], M.linen);
      // Bedside Nightstand with Lamp
      box(root, `Suite_Nightstand_${wing}_F${floor}`, [x - 1.5, y + 0.3, 2.5], [0.45, 0.5, 0.45], M.bedWood);

      // Bathroom Partition Wall
      box(root, `Bath_Wall_${wing}_F${floor}`, [x + 1.8, y + 1.4, 1.0], [0.12, 2.8, 2.6], M.interiorWall);
      // Toilet Bowl and Tank
      box(root, `Toilet_Bowl_${wing}_F${floor}`, [x + 2.4, y + 0.38, 1.2], [0.38, 0.4, 0.5], M.sensorEnclosure);
      box(root, `Toilet_Tank_${wing}_F${floor}`, [x + 2.4, y + 0.8, 1.55], [0.38, 0.5, 0.2], M.sensorEnclosure);

      // Balcony Glass Railing on Front
      box(root, `Balcony_Glass_${wing}_F${floor}`, [x, y + 0.55, -4.6], [6.2, 0.9, 0.05], M.balconyGlass);
      // Wooden vertical decorative louvers on the edge
      for (let li = 0; li < 4; li++) {
        box(
          root,
          `Louver_${wing}_F${floor}_${li}`,
          [wing === "A" ? -9.8 + li * 0.25 : 9.2 + li * 0.25, y + 1.4, -4.5],
          [0.08, 2.8, 0.18],
          M.woodLouver
        );
      }
    }

    // Build suites on Ground (Wing A), Floor 1 (Wings A & B), Floor 2 (Wings A & B)
    buildGuestSuite("A", 0);
    buildGuestSuite("A", 1);
    buildGuestSuite("B", 1);
    buildGuestSuite("A", 2);
    buildGuestSuite("B", 2);

    // 12. Rooftop Overhead Storage Towers: 2 Large Black Ribbed Tanks on Steel Stand
    // Steel scaffolding stand
    box(root, "Tank_Stand_Platform", [-0.6, 9.6, 0.2], [4.8, 0.15, 2.8], M.stainlessSteel);
    for (const lx of [-2.6, 1.4]) {
      for (const lz of [-1.0, 1.4]) {
        cyl(root, `Stand_Leg_${lx}_${lz}`, [lx, 9.0, lz], [lx, 9.6, lz], 0.08, M.stainlessSteel);
      }
    }
    // Cross braces
    cyl(root, "Stand_Brace_1", [-2.6, 9.0, -1.0], [1.4, 9.6, 1.4], 0.04, M.stainlessSteel);
    cyl(root, "Stand_Brace_2", [-2.6, 9.6, -1.0], [1.4, 9.0, 1.4], 0.04, M.stainlessSteel);

    // Two real glass-shelled overhead tanks with visible liquid reserve
    const tankWaterMeshes: THREE.Mesh[] = [];
    for (let ti = 0; ti < 2; ti++) {
      const tx = -1.6 + ti * 2.2;
      const tankMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 2.1, 32, 1, true), M.waterTankTranslucent);
      tankMesh.position.set(tx, 10.75, 0.2);
      tankMesh.castShadow = false;
      tankMesh.receiveShadow = false;
      root.add(tankMesh);

      // Liquid reserve inside the shell (origin at the tank floor so it fills upward)
      const waterGeo = new THREE.CylinderGeometry(0.98, 0.98, 2.08, 32, 1);
      waterGeo.translate(0, 1.04, 0);
      const water = new THREE.Mesh(waterGeo, M.waterSumpBlue);
      water.position.set(tx, 9.71, 0.2);
      water.castShadow = false;
      root.add(water);
      tankWaterMeshes.push(water);

      // Stainless Steel Reinforcing Rings
      for (let ri = 0; ri < 4; ri++) {
        const rib = new THREE.Mesh(new THREE.TorusGeometry(1.07, 0.035, 8, 32), M.stainlessSteel);
        rib.rotation.x = Math.PI / 2;
        rib.position.set(tx, 10.0 + ri * 0.45, 0.2);
        rib.castShadow = true;
        root.add(rib);
      }

      // Sealed base and conical roof cap
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.07, 1.07, 0.12, 32), M.stainlessSteel);
      base.position.set(tx, 9.68, 0.2);
      base.castShadow = true;
      root.add(base);

      const cap = new THREE.Mesh(new THREE.ConeGeometry(1.07, 0.4, 32), M.waterTankCap);
      cap.position.set(tx, 11.98, 0.2);
      cap.castShadow = true;
      root.add(cap);
    }
    tankWaterRef.current = tankWaterMeshes;

    // Ultrasonic Level Sensor on top of the tank with green beacon
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.28, 16), M.greenLed);
    beacon.position.set(-0.6, 12.35, 0.2);
    root.add(beacon);
    ultrasonicBeaconRef.current = beacon;

    // 13. Vibrant Blue Plumbing Distribution Network
    const segments: Record<string, { id: string; a: THREE.Vector3; b: THREE.Vector3; mesh: THREE.Mesh }> = {};
    const particles: { mesh: THREE.Mesh; segment: string; t: number; baseSpeed: number }[] = [];

    function addPipe(id: string, a: [number, number, number], b: [number, number, number], r = 0.08) {
      const mesh = cyl(root, `Pipe_${id}`, a, b, r, M.pipeBlue);
      const A = new THREE.Vector3(...a);
      const B = new THREE.Vector3(...b);
      segments[id] = { id, a: A, b: B, mesh };

      // Flowing water droplet particle
      const p = new THREE.Mesh(new THREE.SphereGeometry(r * 0.8, 8, 8), M.waterSumpBlue);
      p.castShadow = false;
      root.add(p);
      particles.push({
        mesh: p,
        segment: id,
        t: Math.random(),
        baseSpeed: 0.15 + Math.random() * 0.06,
      });
    }

    // Plumbing runs matching the reference picture:
    // 1. Sump to Pump, and Pump to Central Main Riser
    addPipe("sump_to_pump", [-5.2, -2.5, 0.4], [-7.4, -2.5, 0.4], 0.09);
    addPipe("pump_to_riser", [-7.4, -2.5, 0.4], [-0.3, -2.5, 0.4], 0.09);
    // 2. Main Vertical Riser running straight up the central stair core from basement to rooftop tanks!
    addPipe("main_riser", [-0.3, -2.5, 0.4], [-0.3, 11.2, 0.4], 0.11);
    // 3. Riser feed into the 2 rooftop tanks
    addPipe("tank_feed", [-0.3, 11.2, 0.4], [-1.6, 11.2, 0.2], 0.08);

    // 4. Branch lines to Kitchen, Laundry, Wing A, and Wing B
    addPipe("branch_kitchen", [-0.3, -1.8, 0.4], [2.2, -1.8, 1.6], 0.07);
    addPipe("branch_laundry", [2.2, -1.8, 1.6], [7.2, -1.8, 1.8], 0.07);
    addPipe("wingA_f1_pipe", [-0.3, 4.4, 0.4], [-5.2, 4.4, 0.8], 0.07);
    addPipe("wingB_f1_pipe", [-0.3, 4.4, 0.4], [5.2, 4.4, 0.8], 0.07);
    addPipe("wingA_f2_pipe", [-0.3, 7.4, 0.4], [-5.2, 7.4, 0.8], 0.07);
    addPipe("wingB_f2_pipe", [-0.3, 7.4, 0.4], [6.8, 7.4, 0.8], 0.07);

    segmentsRef.current = segments;
    particlesRef.current = particles;

    // 14. Clamp-on Sensors on the Pipes with Glowing LEDs (matching the photo insets!)
    const sensorGroups: Record<string, THREE.Group> = {};
    TWIN_NODES.forEach((d) => {
      const sg = new THREE.Group();
      sg.name = `ClampSensor_${d.id}`;
      sg.position.set(...d.pos);
      sg.userData.nodeId = d.id;

      // Transparent/white clamp box enclosure clamped onto blue pipe
      box(sg, `Box_${d.id}`, [0, 0, 0], [0.36, 0.26, 0.24], M.sensorEnclosure).userData.nodeId = d.id;
      // Clamp straps
      box(sg, `Strap1_${d.id}`, [-0.15, 0, 0], [0.05, 0.32, 0.28], M.stainlessSteel);
      box(sg, `Strap2_${d.id}`, [0.15, 0, 0], [0.05, 0.32, 0.28], M.stainlessSteel);
      // Status LED
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), M.greenLed);
      led.position.set(0, 0.08, 0.13);
      led.userData.nodeId = d.id;
      sg.add(led);
      sg.userData.ledMesh = led;

      root.add(sg);
      sensorGroups[d.id] = sg;
    });
    sensorGroupsRef.current = sensorGroups;

    // 15. Pointer Events & Smooth Orbit
    const pointer = { down: false, x: 0, y: 0, moved: 0, last: performance.now() };

    const onPointerDown = (e: PointerEvent) => {
      pointer.down = true;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.moved = 0;
      pointer.last = performance.now();
      canvas.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!pointer.down) return;
      const dx = e.clientX - pointer.x;
      const dy = e.clientY - pointer.y;
      pointer.moved += Math.abs(dx) + Math.abs(dy);
      pointer.x = e.clientX;
      pointer.y = e.clientY;

      targetSphericalRef.current.theta -= dx * 0.005;
      targetSphericalRef.current.phi = Math.max(0.2, Math.min(1.42, targetSphericalRef.current.phi + dy * 0.005));
      pointer.last = performance.now();
    };

    const onPointerUp = (e: PointerEvent) => {
      pointer.down = false;
      if (pointer.moved < 6) {
        const rect = canvas.getBoundingClientRect();
        const mouse = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(root.children, true);

        for (const hit of intersects) {
          let o: THREE.Object3D | null = hit.object;
          while (o && o !== root && !o.userData.nodeId) {
            o = o.parent;
          }
          if (o && o.userData.nodeId) {
            setSelectedNodeId(o.userData.nodeId);
            playSound("beep");
            showToast(`Selected ${TWIN_NODES.find((d) => d.id === o.userData.nodeId)?.name}`);
            return;
          }
        }
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      targetSphericalRef.current.radius = Math.max(
        16,
        Math.min(68, targetSphericalRef.current.radius + e.deltaY * 0.03)
      );
      pointer.last = performance.now();
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    // 16. Window Resize Observer
    const resizeObserver = new ResizeObserver(() => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    });
    resizeObserver.observe(container);

    // 17. Animation Loop
    let animId: number;
    let lastTime = performance.now();
    let frameCounter = 0;

    const animate = (now: number) => {
      animId = requestAnimationFrame(animate);
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      frameCounter++;

      if (autoRotate && !pointer.down && now - pointer.last > 2500) {
        targetSphericalRef.current.theta += dt * 0.06;
      }

      // Smooth camera lerp
      sphericalRef.current.theta += (targetSphericalRef.current.theta - sphericalRef.current.theta) * 0.12;
      sphericalRef.current.phi += (targetSphericalRef.current.phi - sphericalRef.current.phi) * 0.12;
      sphericalRef.current.radius += (targetSphericalRef.current.radius - sphericalRef.current.radius) * 0.12;

      currentLookAtRef.current.lerp(targetPosRef.current, 0.1);

      camera.position.setFromSpherical(sphericalRef.current).add(currentLookAtRef.current);
      camera.lookAt(currentLookAtRef.current);

      // Pulse alert wave propagation along pipes
      const pulse = pulseStateRef.current;
      if (pulse.path.length) {
        pulse.timer += dt;
        if (pulse.timer >= 0.55) {
          pulse.timer = 0;
          pulse.index = (pulse.index + 1) % pulse.path.length;
        }
        const activeSegmentId = pulse.path[pulse.index];
        Object.values(segments).forEach((s) => {
          const isActive = s.id === activeSegmentId;
          s.mesh.material = isActive ? materialsRef.current.pipeAlert : materialsRef.current.pipeBlue;
        });
      }

      // Animated Water Particles along blue pipes
      for (const p of particles) {
        const seg = segments[p.segment];
        if (!seg) continue;

        let flowSpeedMultiplier = 1.0;
        const s = pulse.path.includes(p.segment);
        if (s) flowSpeedMultiplier = 2.2;

        p.t = (p.t + dt * p.baseSpeed * flowSpeedMultiplier) % 1;
        p.mesh.position.lerpVectors(seg.a, seg.b, p.t);
        p.mesh.material = s ? materialsRef.current.pipeAlert : materialsRef.current.waterSumpBlue;
      }

      // Tank reserve level: raise/lower the in-tank liquid to match telemetry
      const fill = tankLevelRef.current;
      for (const w of tankWaterRef.current) {
        w.visible = fill > 0.02;
        w.scale.y = Math.max(0.03, fill);
      }

      // Ultrasonic Tank Beacon Pulsing
      if (ultrasonicBeaconRef.current) {
        const isOverflow = tankOverflow;
        const blink = Math.sin(now * (isOverflow ? 0.015 : 0.005)) > 0;
        ultrasonicBeaconRef.current.material = isOverflow && blink ? materialsRef.current.redLed : materialsRef.current.greenLed;
      }

      // Project 3D Sensor coordinates to screen space for floating pins
      if (frameCounter % 2 === 0 && container) {
        const rect = container.getBoundingClientRect();
        const pinMap: Record<string, { x: number; y: number; visible: boolean }> = {};

        TWIN_NODES.forEach((tn) => {
          const sg = sensorGroups[tn.id];
          if (!sg) return;

          const worldPos = new THREE.Vector3();
          sg.getWorldPosition(worldPos);
          worldPos.y += 0.5;

          const projected = worldPos.clone().project(camera);
          const isVisible = projected.z > -1 && projected.z < 1;
          const screenX = (projected.x * 0.5 + 0.5) * rect.width;
          const screenY = (-projected.y * 0.5 + 0.5) * rect.height;

          pinMap[tn.id] = {
            x: screenX,
            y: screenY,
            visible: isVisible && screenX > 20 && screenX < rect.width - 340 && screenY > 40 && screenY < rect.height - 40,
          };
        });

        setProjectedPins(pinMap);
      }

      renderer.render(scene, camera);
    };

    animId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
      environment.texture.dispose();
      skyGeo.dispose();
      skyMat.dispose();
      renderer.dispose();
    };
  }, [isNight]);

  // Lighting & Theme Updates
  useEffect(() => {
    if (!sceneRef.current || !dirSunRef.current || !hemiLightRef.current || !rendererRef.current) return;
    const bgCol = isNight ? new THREE.Color("#334155") : new THREE.Color("#eef2f6");
    sceneRef.current.background = bgCol;
    dirSunRef.current.intensity = isNight ? 1.6 : 2.6;
    hemiLightRef.current.intensity = isNight ? 0.35 : 0.7;
    rendererRef.current.toneMappingExposure = isNight ? 1.15 : 1.0;
  }, [isNight]);

  // Sensor LED and Alert Marker Visual Sync
  useEffect(() => {
    const sGroups = sensorGroupsRef.current;
    const M = materialsRef.current;
    if (!M) return;

    Object.entries(nodesData).forEach(([id, data]) => {
      const g = sGroups[id];
      if (!g || !g.userData.ledMesh) return;

      if (data.state === "leak") {
        g.userData.ledMesh.material = M.redLed;
      } else if (data.inherited || data.state === "warning") {
        g.userData.ledMesh.material = M.amberLed;
      } else {
        g.userData.ledMesh.material = M.greenLed;
      }
    });
  }, [nodesData]);

  // Camera Floor Focus
  const handleFloorChange = (floorKey: string) => {
    setFocusedFloor(floorKey);
    let y = 4.2;
    let radius = 46;
    if (floorKey === "0") {
      y = 1.2;
      radius = 32;
    } else if (floorKey === "1") {
      y = 4.2;
      radius = 32;
    } else if (floorKey === "2") {
      y = 7.2;
      radius = 32;
    } else if (floorKey === "roof") {
      y = 10.5;
      radius = 28;
    } else if (floorKey === "plant") {
      y = -1.8;
      radius = 26;
    } else {
      y = 4.2;
      radius = 46;
    }

    targetPosRef.current.set(0, y, 0);
    targetSphericalRef.current.radius = radius;
    playSound("click");
  };

  // Scenario Simulations for Front Desk Demos
  const handleSimulateLeak = async () => {
    playSound("alert");
    const nextState = !simulatedLeak;
    setSimulatedLeak(nextState);
    setDispatchAlertSent(false);

    if (nextState) {
      setSelectedNodeId("S7");
      showToast("Simulating Active Guest Fixture Leak (Wing B · Room 206)");

      // Optimistic hydraulic updates for zero-latency UI
      setNodesData((prev) => ({
        ...prev,
        S7: {
          ...prev.S7,
          live: 395,
          state: "leak",
          excess: 240,
          frontDeskNote: "⚠️ Continuous fixture draw in Room 206 (+240 L/h). Suspected toilet flapper leak.",
        },
        S4: {
          ...prev.S4,
          live: (prev.S4?.live || 480) + 240,
          inherited: true,
          frontDeskNote: "Elevated riser flow (+240 L/h) carrying excess draw from downstream Suite 206.",
        },
        S1: {
          ...prev.S1,
          live: (prev.S1?.live || 180) + 240,
          inherited: true,
          frontDeskNote: "Main municipal booster intake elevated (+240 L/h) to maintain line pressure.",
        },
      }));

      try {
        await injectFault({
          node_id: "floor_b2",
          fault_type: "PIPE_BURST",
          intensity_lph: 240,
        });
        if (simState?.status !== "RUNNING") {
          await step();
        }
      } catch {
        /* fallback handled gracefully */
      }
    } else {
      showToast("Fixture leak resolved · Normal flow restored");
      try {
        await remediation();
        if (simState?.status !== "RUNNING") {
          await step();
        }
      } catch {
        /* fallback handled gracefully */
      }

      setNodesData((prev) => {
        const next = { ...prev };
        TWIN_NODES.forEach((tn) => {
          if (next[tn.id]) {
            next[tn.id] = {
              ...next[tn.id],
              live: tn.isTank ? (simState?.tank_level_pct ?? 82) : tn.baseFlow,
              state: "normal",
              inherited: false,
              excess: 0,
              frontDeskNote: tn.frontDeskNote,
            };
          }
        });
        return next;
      });
    }
  };

  const handleReset = async () => {
    playSound("click");
    setSimulatedLeak(false);
    setTankOverflow(false);
    setHalfLaundry(false);
    setFocusedFloor("all");
    setDispatchAlertSent(false);
    targetPosRef.current.set(0, 4.2, 0);
    targetSphericalRef.current.radius = 46;

    try {
      await remediation();
      if (simState?.status !== "RUNNING") {
        await step();
      }
    } catch {
      /* ignore */
    }

    setNodesData(() => {
      const map: Record<string, NodeLiveState> = {};
      TWIN_NODES.forEach((n) => {
        map[n.id] = {
          id: n.id,
          name: n.name,
          subtitle: n.subtitle,
          live: n.isTank ? (simState?.tank_level_pct ?? 82) : n.baseFlow,
          lo: n.lo,
          hi: n.hi,
          state: "normal",
          inherited: false,
          simulated: false,
          frontDeskNote: n.frontDeskNote,
          excess: 0,
        };
      });
      return map;
    });

    showToast("Hotel water network nominal · Normal baseline restored");
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const selectedNode = nodesData[selectedNodeId] || nodesData.S7;
  const selectedNodeDef = TWIN_NODES.find((d) => d.id === selectedNodeId) || TWIN_NODES[6];

  // Water Loss Calculation (Tariff ₹150/kL)
  const estCostPerDay = useMemo(() => {
    if (selectedNode.state === "leak" || selectedNode.excess > 0) {
      const extraLph = selectedNode.excess > 0 ? selectedNode.excess : Math.max(0, selectedNode.live - selectedNode.hi);
      const totalLitresDay = extraLph * 24;
      return (totalLitresDay / 1000) * 150;
    }
    return 0;
  }, [selectedNode]);

  const activeAlertsCount = Object.values(nodesData).filter((n) => n.state === "leak" || n.state === "warning").length;
  const isHealthy = activeAlertsCount === 0;

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden select-none font-sans transition-colors duration-300 ${
        compact ? "h-[540px] rounded-2xl" : "h-[calc(100vh-100px)] min-h-[660px] rounded-3xl"
      } ${
        isNight
          ? "bg-[#1e293b] text-[#f1f5f9]"
          : "bg-[#eef2f6] text-[#1e293b] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.06)]"
      }`}
    >
      {/* 3D WebGL Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full outline-none cursor-grab active:cursor-grabbing" />

      {/* Floating 3D Callout Pins on the Building (matching photo) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {TWIN_NODES.map((tn) => {
          const pin = projectedPins[tn.id];
          if (!pin || !pin.visible) return null;

          const liveNode = nodesData[tn.id];
          const isSelected = selectedNodeId === tn.id;
          const isLeak = liveNode?.state === "leak";
          const isInherited = liveNode?.inherited;

          const labelText = tn.isTank
            ? `${Math.round(liveNode?.live ?? 82)}% Reserve`
            : `${Math.round(liveNode?.live ?? tn.baseFlow)} L/h`;

          return (
            <div
              key={tn.id}
              style={{
                left: `${pin.x}px`,
                top: `${pin.y}px`,
                transform: "translate(-50%, -100%)",
              }}
              className="absolute pointer-events-auto transition-transform duration-100 hover:scale-105"
            >
              <button
                onClick={() => {
                  setSelectedNodeId(tn.id);
                  playSound("beep");
                }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md shadow-md text-xs font-medium transition-all ${
                  isLeak
                    ? "bg-red-500 text-white ring-4 ring-red-400/30 animate-pulse shadow-red-500/30 font-bold"
                    : isInherited
                    ? "bg-amber-500 text-white ring-2 ring-amber-300 shadow-amber-500/20 font-semibold"
                    : isSelected
                    ? "bg-blue-600 text-white shadow-blue-500/30 ring-2 ring-white font-semibold"
                    : isNight
                    ? "bg-[#1e293b]/90 text-white border border-white/10 hover:border-sky-400"
                    : "bg-white/95 text-slate-700 border border-slate-200/90 hover:border-blue-400 shadow-slate-200/80"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    isLeak
                      ? "bg-white animate-ping"
                      : isInherited
                      ? "bg-white"
                      : isSelected
                      ? "bg-white"
                      : "bg-emerald-500"
                  }`}
                />
                <span className="font-semibold">{tn.id}</span>
                <span className="opacity-40">·</span>
                <span className="font-mono">{labelText}</span>
              </button>

              <div
                className={`w-0 h-0 mx-auto border-x-[5px] border-x-transparent border-t-[6px] ${
                  isLeak
                    ? "border-t-red-500"
                    : isInherited
                    ? "border-t-amber-500"
                    : isSelected
                    ? "border-t-blue-600"
                    : isNight
                    ? "border-t-[#1e293b]"
                    : "border-t-white"
                }`}
              />
            </div>
          );
        })}
      </div>

      {/* Unified Top Control Bar (Uncluttered, zero overlap) */}
      <div className="absolute top-4 left-4 z-20 pointer-events-none flex flex-wrap items-center gap-2">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2 p-1.5 rounded-2xl bg-white/95 backdrop-blur-md border border-slate-200/80 shadow-sm text-slate-800">
          {/* Health Pill */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/60 text-xs font-semibold">
            <span
              className={`h-2 w-2 rounded-full ${
                isHealthy ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]" : "bg-red-500 animate-ping"
              }`}
            />
            <span className={isHealthy ? "text-slate-800" : "text-red-600 font-bold"}>
              {isHealthy ? "All 7 Zones Nominal" : "⚠️ Suite 206 Leak (+240 L/h)"}
            </span>
          </div>

          <div className="h-4 w-px bg-slate-200 hidden sm:block" />

          {/* Floor Selection Pills */}
          <div className="flex items-center gap-1">
            {[
              { key: "all", label: "Whole Hotel" },
              { key: "roof", label: "Roof Tanks" },
              { key: "2", label: "Floor 2", alert: nodesData.S7?.state === "leak" || simulatedLeak },
              { key: "1", label: "Floor 1" },
              { key: "0", label: "Ground" },
              { key: "plant", label: "Basement" },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => handleFloorChange(f.key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition flex items-center gap-1.5 ${
                  focusedFloor === f.key
                    ? "bg-blue-600 text-white font-semibold shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                <span>{f.label}</span>
                {f.alert && <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-ping" />}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-slate-200 hidden md:block" />

          {/* Ambient Studio Controls */}
          <div className="hidden md:flex items-center gap-0.5">
            <button
              onClick={() => {
                setIsNight(!isNight);
                playSound("click");
              }}
              className="p-1.5 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition"
              title="Toggle Day/Night Lighting"
            >
              {isNight ? <Moon size={14} /> : <Sun size={14} />}
            </button>
            <button
              onClick={() => {
                setAutoRotate(!autoRotate);
                playSound("click");
              }}
              className={`p-1.5 rounded-xl transition ${
                autoRotate ? "text-blue-600 font-bold bg-blue-50" : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
              }`}
              title="Auto Orbit Rotation"
            >
              <RotateCw size={14} className={autoRotate ? "animate-spin" : ""} />
            </button>
            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition"
              title="Fullscreen"
            >
              {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>
        </div>
      </div>

      {/* Right Side Front Desk Telemetry Card */}
      {showInspector ? (
        <div
          className={`absolute top-4 right-4 bottom-4 z-20 w-[340px] max-w-[calc(100%-32px)] rounded-3xl backdrop-blur-2xl border shadow-xl flex flex-col overflow-hidden transition-all duration-300 ${
          isNight
            ? "bg-[#1e293b]/95 border-white/10 text-white shadow-black/40"
            : "bg-white/95 border-slate-200/90 text-slate-800 shadow-[0_20px_50px_-15px_rgba(15,23,42,0.08)]"
        }`}
      >
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Selected Zone
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold flex items-center gap-1.5 ${
                selectedNode.state === "leak"
                  ? "bg-red-50 text-red-600"
                  : selectedNode.inherited
                  ? "bg-amber-50 text-amber-700"
                  : "bg-emerald-50 text-emerald-600"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  selectedNode.state === "leak"
                    ? "bg-red-500 animate-ping"
                    : selectedNode.inherited
                    ? "bg-amber-500"
                    : "bg-emerald-500"
                }`}
              />
              <span>
                {selectedNode.state === "leak"
                  ? "Leak Origin"
                  : selectedNode.inherited
                  ? "Elevated Riser"
                  : "Normal Draw"}
              </span>
            </span>
          </div>

          <h2 className="text-base font-bold tracking-tight text-slate-900">
            {selectedNode.name}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">{selectedNodeDef.guestRoomInfo || selectedNode.subtitle}</p>

          {/* Quick Zone Chips */}
          <div className="flex items-center gap-1 mt-3 overflow-x-auto pb-0.5">
            {TWIN_NODES.map((n) => {
              const liveN = nodesData[n.id];
              const isAlert = liveN?.state === "leak";
              const isElevated = liveN?.inherited;
              const isSelected = selectedNodeId === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => {
                    setSelectedNodeId(n.id);
                    playSound("click");
                  }}
                  className={`px-2.5 py-1 rounded-xl text-xs font-semibold font-mono transition ${
                    isSelected
                      ? "bg-blue-600 text-white font-bold shadow-xs"
                      : isAlert
                      ? "bg-red-100 text-red-700 border border-red-200 font-bold"
                      : isElevated
                      ? "bg-amber-50 text-amber-800 border border-amber-200"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200/60"
                  }`}
                >
                  {n.id}
                </button>
              );
            })}
          </div>
        </div>

        {/* Card Body Metrics */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
          {selectedNodeDef.isTank ? (
            /* Tank Reserve View */
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3 rounded-2xl border bg-slate-50 border-slate-200/80">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Reserve Level</span>
                  <div className="flex items-baseline gap-1">
                    <strong className="text-2xl font-extrabold font-mono text-blue-600">
                      {Math.round(selectedNode.live)}%
                    </strong>
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    Safe Band: 40–100%
                  </span>
                </div>

                <div className="p-3 rounded-2xl border bg-slate-50 border-slate-200/80">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Emergency Buffer</span>
                  <div className="flex items-baseline gap-1">
                    <strong className="text-2xl font-extrabold font-mono text-slate-900">
                      {((selectedNode.live * 500) / Math.max(1, nodesData.S1?.live || 180)).toFixed(1)}
                    </strong>
                    <span className="text-xs text-slate-500 font-medium">hrs</span>
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    Gravity head steady
                  </span>
                </div>
              </div>

              {/* Tank Level Bar */}
              <div className="p-3.5 rounded-2xl border bg-slate-50 border-slate-200/80">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-slate-700">Dual Rooftop Reserve</span>
                  <span className="text-xs font-bold font-mono text-blue-600">
                    {Math.round(selectedNode.live * 500).toLocaleString()} L / 50,000 L
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(0, selectedNode.live))}%` }}
                  />
                </div>
                <div className="flex justify-between items-center text-[10px] text-slate-500 mt-1.5">
                  <span>Dual Cylindrical Towers</span>
                  <span>{selectedNode.live < 40 ? "⚠️ Refill Pump Recommended" : "Adequate Supply"}</span>
                </div>
              </div>
            </div>
          ) : (
            /* Flow Meter View */
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 rounded-2xl border bg-slate-50 border-slate-200/80">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Live Flow Rate</span>
                <div className="flex items-baseline gap-1">
                  <strong className="text-2xl font-extrabold font-mono text-slate-900">
                    {Math.round(selectedNode.live)}
                  </strong>
                  <span className="text-xs text-slate-500 font-medium">L/h</span>
                </div>
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  Band: {selectedNode.lo}–{selectedNode.hi} L/h
                </span>
              </div>

              <div
                className={`p-3 rounded-2xl border ${
                  estCostPerDay > 0
                    ? "bg-red-50 border-red-200 text-red-700"
                    : "bg-slate-50 border-slate-200/80"
                }`}
              >
                <span className="text-[10px] uppercase font-bold block mb-0.5 opacity-70">Water Loss Cost</span>
                <div className="flex items-baseline gap-1">
                  <strong className="text-2xl font-extrabold font-mono text-slate-900">
                    {fmtCurrency(estCostPerDay)}
                  </strong>
                  <span className="text-xs text-slate-500">/day</span>
                </div>
                <span className="text-[10px] block mt-0.5 text-slate-500">
                  {estCostPerDay > 0 ? "Excess Draw" : "Zero Waste"}
                </span>
              </div>
            </div>
          )}

          {/* Front Desk Intelligence & Advisory */}
          <div
            className={`p-3.5 rounded-2xl border transition-all ${
              selectedNode.state === "leak"
                ? "bg-red-50/80 border-red-200"
                : selectedNode.inherited
                ? "bg-amber-50/70 border-amber-200"
                : "bg-slate-50 border-slate-200/80"
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              {selectedNode.state === "leak" ? (
                <AlertCircle size={15} className="text-red-500" />
              ) : selectedNode.inherited ? (
                <Zap size={15} className="text-amber-500" />
              ) : (
                <CheckCircle2 size={15} className="text-emerald-500" />
              )}
              <span className="text-xs font-bold text-slate-900">
                Front Desk Advisory
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              {selectedNode.frontDeskNote}
            </p>

            {selectedNode.state === "leak" && (
              <div className="mt-3 pt-2.5 border-t border-red-200/60">
                <button
                  onClick={() => {
                    setDispatchAlertSent(true);
                    playSound("beep");
                    showToast("Work order #402 dispatched to hotel engineering staff");
                  }}
                  disabled={dispatchAlertSent}
                  className={`w-full py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition ${
                    dispatchAlertSent
                      ? "bg-emerald-600 text-white"
                      : "bg-red-600 hover:bg-red-700 text-white shadow-sm"
                  }`}
                >
                  {dispatchAlertSent ? (
                    <>
                      <CheckCircle2 size={14} />
                      <span>Maintenance Dispatched (Order #402)</span>
                    </>
                  ) : (
                    <>
                      <Send size={14} />
                      <span>Dispatch Maintenance to Room 206</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Card Footer: Integrated Simulation Scenarios & Clock */}
        <div className="p-3.5 border-t border-slate-100 bg-slate-50/50 space-y-2.5">
          <div className="flex items-center gap-2">
            <button
              onClick={handleSimulateLeak}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition ${
                simulatedLeak || nodesData.S7?.state === "leak"
                  ? "bg-red-600 text-white shadow-sm animate-pulse"
                  : "bg-white text-slate-700 hover:bg-slate-100 border border-slate-200 shadow-xs"
              }`}
            >
              <Droplets size={13} />
              <span>{simulatedLeak || nodesData.S7?.state === "leak" ? "Stop Room 206 Leak" : "Test Room 206 Leak"}</span>
            </button>

            <button
              onClick={handleReset}
              className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-200 shadow-xs transition flex items-center gap-1"
              title="Reset Baseline"
            >
              <RefreshCw size={12} />
              <span>Reset</span>
            </button>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 px-0.5">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
              <span className="font-medium text-slate-500">Live Telemetry</span>
            </div>
            <span className="font-mono text-slate-500 font-semibold">
              {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        </div>
        </div>
      ) : null}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute top-5 left-1/2 -translate-x-1/2 z-50 pointer-events-none transition-all duration-300">
          <div className="px-4 py-2 rounded-full bg-slate-800 text-white shadow-xl backdrop-blur-md text-xs font-medium flex items-center gap-2 border border-slate-700">
            <Zap size={13} className="text-blue-400" />
            <span>{toastMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
}
