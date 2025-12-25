import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GestureMode } from "../hooks/useMediaPipe";
import "./ChristmasTree.css";

interface ChristmasTreeProps {
  mode: GestureMode;
  handPosition?: { x: number; y: number };
  handDetected?: boolean;
}

interface Particle {
  mesh: THREE.Mesh | THREE.Group;
  type: string;
  isDust: boolean;
  posTree: THREE.Vector3;
  posScatter: THREE.Vector3;
  baseScale: number;
  spinSpeed: THREE.Vector3;
}

const CONFIG = {
  colors: {
    bg: 0x000000,
    champagneGold: 0xffd966,
    deepGreen: 0x03180a,
    accentRed: 0x990000,
  },
  particles: {
    count: 1500,
    dustCount: 2500,
    treeHeight: 24,
    treeRadius: 8,
  },
  camera: {
    z: 50,
  },
};

export default function ChristmasTree({
  mode,
  handPosition = { x: 0, y: 0 },
  handDetected = false,
}: ChristmasTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const composerRef = useRef<EffectComposer | null>(null);
  const mainGroupRef = useRef<THREE.Group | null>(null);
  const particleSystemRef = useRef<Particle[]>([]);
  const focusTargetRef = useRef<THREE.Mesh | THREE.Group | null>(null);
  const clockRef = useRef(new THREE.Clock());
  const [isInitialized, setIsInitialized] = useState(false);
  const modeRef = useRef<GestureMode>(mode);
  const handPositionRef = useRef({ x: 0, y: 0 });
  const handDetectedRef = useRef(false);
  const caneTextureRef = useRef<THREE.CanvasTexture | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const isAnimatingRef = useRef(false);
  const rotationRef = useRef({ x: 0, y: 0 });

  // Sync mode and hand position to refs
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    if (handPosition) {
      handPositionRef.current = handPosition;
    }
  }, [handPosition]);

  useEffect(() => {
    handDetectedRef.current = handDetected;
  }, [handDetected]);

  useEffect(() => {
    if (!containerRef.current) return;

    console.log("[ChristmasTree] useEffect triggered");

    // Simulate initialization delay for smooth loading experience
    setTimeout(() => {
      console.log("[ChristmasTree] Starting initialization...");
      initThree();
      console.log("[ChristmasTree] initThree done");
      setupEnvironment();
      console.log("[ChristmasTree] setupEnvironment done");
      setupLights();
      console.log("[ChristmasTree] setupLights done");
      createTextures();
      console.log("[ChristmasTree] createTextures done");
      createParticles();
      console.log("[ChristmasTree] createParticles done");
      createDust();
      console.log("[ChristmasTree] createDust done");
      createDefaultPhotos();
      console.log("[ChristmasTree] createDefaultPhotos done");
      setupPostProcessing();
      console.log("[ChristmasTree] setupPostProcessing done");

      setIsInitialized(true);
      console.log("[ChristmasTree] setIsInitialized(true) called");
      console.log("[ChristmasTree] Starting animate loop...");

      let frameCount = 0;
      // Animation loop - inline all logic like old version
      function animate() {
        if (!isAnimatingRef.current) {
          console.log("[Animate] Animation stopped, exiting");
          return;
        }

        try {
          animationFrameIdRef.current = requestAnimationFrame(animate);

          frameCount++;
          if (frameCount === 1) {
            console.log("[Animate] First frame");
          } else if (frameCount === 2) {
            console.log("[Animate] Second frame");
          } else if (frameCount === 10) {
            console.log("[Animate] 10th frame, animation running smoothly");
          }

          const dt = clockRef.current.getDelta();

          if (frameCount === 1) {
            console.log("[Animate] dt:", dt);
            console.log("[Animate] cameraRef:", !!cameraRef.current);
            console.log("[Animate] mainGroupRef:", !!mainGroupRef.current);
            console.log(
              "[Animate] particleSystem length:",
              particleSystemRef.current.length
            );
          }

          // Update particles - inline logic
          if (cameraRef.current && mainGroupRef.current) {
            if (frameCount === 1) {
              console.log("[Animate] Entering particle update");
            }
            const currentMode = modeRef.current;

            particleSystemRef.current.forEach((particle) => {
              let target = particle.posTree;

              if (currentMode === "SCATTER") {
                target = particle.posScatter;
              } else if (currentMode === "FOCUS") {
                if (particle.mesh === focusTargetRef.current) {
                  const desiredWorldPos = new THREE.Vector3(0, 2, 35);
                  const invMatrix = new THREE.Matrix4()
                    .copy(mainGroupRef.current!.matrixWorld)
                    .invert();
                  target = desiredWorldPos.applyMatrix4(invMatrix);
                } else {
                  target = particle.posScatter;
                }
              }

              const lerpSpeed =
                currentMode === "FOCUS" &&
                particle.mesh === focusTargetRef.current
                  ? 5.0
                  : 2.0;
              particle.mesh.position.lerp(target, lerpSpeed * dt);

              // Rotation
              if (currentMode === "SCATTER") {
                particle.mesh.rotation.x += particle.spinSpeed.x * dt;
                particle.mesh.rotation.y += particle.spinSpeed.y * dt;
                particle.mesh.rotation.z += particle.spinSpeed.z * dt;
              } else if (currentMode === "TREE") {
                particle.mesh.rotation.x = THREE.MathUtils.lerp(
                  particle.mesh.rotation.x,
                  0,
                  dt * 2
                );
                particle.mesh.rotation.z = THREE.MathUtils.lerp(
                  particle.mesh.rotation.z,
                  0,
                  dt * 2
                );
                particle.mesh.rotation.y += 0.5 * dt;
              }

              if (
                currentMode === "FOCUS" &&
                particle.mesh === focusTargetRef.current
              ) {
                particle.mesh.lookAt(cameraRef.current!.position);
              }

              // Scale
              let s = particle.baseScale;
              if (particle.isDust) {
                s =
                  particle.baseScale *
                  (0.8 +
                    0.4 *
                      Math.sin(
                        clockRef.current.elapsedTime * 4 + particle.mesh.id
                      ));
                if (currentMode === "TREE") s = 0;
              } else if (
                currentMode === "SCATTER" &&
                particle.type === "PHOTO"
              ) {
                s = particle.baseScale * 2.5;
              } else if (currentMode === "FOCUS") {
                if (particle.mesh === focusTargetRef.current) {
                  s = 4.5;
                } else {
                  s = particle.baseScale * 0.8;
                }
              }

              particle.mesh.scale.lerp(new THREE.Vector3(s, s, s), 4 * dt);
            });

            if (frameCount === 1) {
              console.log("[Animate] Particle update done");
            }
          }

          // Tree rotation logic - from old version
          const currentMode = modeRef.current;
          const currentHandPos = handPositionRef.current;
          const currentHandDetected = handDetectedRef.current;
          
          if (currentMode === "SCATTER" && currentHandDetected) {
            // 手势控制旋转
            const targetRotY = currentHandPos.x * Math.PI * 0.9;
            const targetRotX = currentHandPos.y * Math.PI * 0.25;
            rotationRef.current.y += (targetRotY - rotationRef.current.y) * 3.0 * dt;
            rotationRef.current.x += (targetRotX - rotationRef.current.x) * 3.0 * dt;
          } else {
            if (currentMode === "TREE") {
              rotationRef.current.y += 0.3 * dt;
              rotationRef.current.x += (0 - rotationRef.current.x) * 2.0 * dt;
            } else {
              rotationRef.current.y += 0.1 * dt;
            }
          }
          
          if (mainGroupRef.current) {
            mainGroupRef.current.rotation.y = rotationRef.current.y;
            mainGroupRef.current.rotation.x = rotationRef.current.x;
          }

          if (frameCount === 1) {
            console.log("[Animate] Tree rotation done");
          }

          if (composerRef.current) {
            if (frameCount === 1) {
              console.log("[Animate] Rendering...");
              console.log("[Animate] Composer:", composerRef.current);
              console.log("[Animate] Renderer:", rendererRef.current);
              console.log(
                "[Animate] Scene children:",
                sceneRef.current?.children.length
              );
              console.log(
                "[Animate] MainGroup children:",
                mainGroupRef.current?.children.length
              );
            }
            composerRef.current.render();
            if (frameCount === 1) {
              console.log("[Animate] Render done");
            }
          } else {
            if (frameCount === 1) {
              console.log("[Animate] ERROR: composerRef is null!");
            }
          }

          if (frameCount === 1) {
            console.log("[Animate] Frame complete");
          }
        } catch (error) {
          console.error("[Animate] Error:", error);
          throw error;
        }
      }

      console.log("[ChristmasTree] Calling animate() for first time...");
      isAnimatingRef.current = true;
      animate();
      console.log(
        "[ChristmasTree] animate() called, isAnimatingRef:",
        isAnimatingRef.current
      );
    }, 100);

    // Listen for photo upload events
    const handleAddPhoto = (event: CustomEvent) => {
      const imageUrl = event.detail.imageUrl;
      const textureLoader = new THREE.TextureLoader();
      textureLoader.load(imageUrl, (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        addPhotoToScene(texture);
      });
    };

    window.addEventListener('add-photo', handleAddPhoto as EventListener);

    // Handle window resize
    const handleResize = () => {
      if (!cameraRef.current || !rendererRef.current || !composerRef.current)
        return;

      cameraRef.current.aspect = window.innerWidth / window.innerHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(window.innerWidth, window.innerHeight);
      composerRef.current.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener("resize", handleResize);

    // Cleanup function
    return () => {
      console.log("[ChristmasTree] Cleanup called, stopping animation");
      isAnimatingRef.current = false;
      if (animationFrameIdRef.current !== null) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
      window.removeEventListener("resize", handleResize);
      window.removeEventListener('add-photo', handleAddPhoto as EventListener);
      rendererRef.current?.dispose();
    };
  }, []);

  useEffect(() => {
    // Update focus target when mode changes to FOCUS
    if (mode === "FOCUS" && !focusTargetRef.current) {
      const photos = particleSystemRef.current.filter(
        (p) => p.type === "PHOTO"
      );
      if (photos.length > 0) {
        focusTargetRef.current =
          photos[Math.floor(Math.random() * photos.length)].mesh;
      }
    } else if (mode !== "FOCUS") {
      focusTargetRef.current = null;
    }
  }, [mode]);

  const initThree = () => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.colors.bg);
    scene.fog = new THREE.FogExp2(CONFIG.colors.bg, 0.01);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      42,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    // Camera fixed at same position as old version
    camera.position.set(0, 2, CONFIG.camera.z);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ReinhardToneMapping;
    renderer.toneMappingExposure = 2.2;
    rendererRef.current = renderer;

    containerRef.current.appendChild(renderer.domElement);
    console.log("[initThree] Canvas added to DOM:", renderer.domElement);
    console.log(
      "[initThree] Canvas dimensions:",
      renderer.domElement.width,
      "x",
      renderer.domElement.height
    );

    const mainGroup = new THREE.Group();
    scene.add(mainGroup);
    mainGroupRef.current = mainGroup;
  };

  const setupEnvironment = () => {
    if (!rendererRef.current || !sceneRef.current) return;

    const pmremGenerator = new THREE.PMREMGenerator(rendererRef.current);
    sceneRef.current.environment = pmremGenerator.fromScene(
      new RoomEnvironment(),
      0.04
    ).texture;
  };

  const setupLights = () => {
    if (!sceneRef.current || !mainGroupRef.current) return;

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    sceneRef.current.add(ambient);

    const innerLight = new THREE.PointLight(0xffaa00, 2, 20);
    innerLight.position.set(0, 5, 0);
    mainGroupRef.current.add(innerLight);

    const spotGold = new THREE.SpotLight(0xffcc66, 1200);
    spotGold.position.set(30, 40, 40);
    spotGold.angle = 0.5;
    spotGold.penumbra = 0.5;
    sceneRef.current.add(spotGold);

    const spotBlue = new THREE.SpotLight(0x6688ff, 600);
    spotBlue.position.set(-30, 20, -30);
    sceneRef.current.add(spotBlue);

    const fill = new THREE.DirectionalLight(0xffeebb, 0.8);
    fill.position.set(0, 0, 50);
    sceneRef.current.add(fill);
  };

  const createTextures = () => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = "#880000";
    ctx.beginPath();
    for (let i = -128; i < 256; i += 32) {
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 32, 128);
      ctx.lineTo(i + 16, 128);
      ctx.lineTo(i - 16, 0);
    }
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(3, 3);
    caneTextureRef.current = texture;
  };

  const createParticles = () => {
    if (!mainGroupRef.current) return;

    const sphereGeo = new THREE.SphereGeometry(0.5, 32, 32);
    const boxGeo = new THREE.BoxGeometry(0.55, 0.55, 0.55);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.5, 0),
      new THREE.Vector3(0, 0.3, 0),
      new THREE.Vector3(0.1, 0.5, 0),
      new THREE.Vector3(0.3, 0.4, 0),
    ]);
    const candyGeo = new THREE.TubeGeometry(curve, 16, 0.08, 8, false);

    const goldMat = new THREE.MeshStandardMaterial({
      color: CONFIG.colors.champagneGold,
      metalness: 1.0,
      roughness: 0.1,
      envMapIntensity: 2.0,
      emissive: 0x443300,
      emissiveIntensity: 0.3,
    });

    const greenMat = new THREE.MeshStandardMaterial({
      color: CONFIG.colors.deepGreen,
      metalness: 0.2,
      roughness: 0.8,
      emissive: 0x002200,
      emissiveIntensity: 0.2,
    });

    const redMat = new THREE.MeshPhysicalMaterial({
      color: CONFIG.colors.accentRed,
      metalness: 0.3,
      roughness: 0.2,
      clearcoat: 1.0,
      emissive: 0x330000,
    });

    const candyMat = new THREE.MeshStandardMaterial({
      map: caneTextureRef.current!,
      roughness: 0.4,
    });

    for (let i = 0; i < CONFIG.particles.count; i++) {
      const rand = Math.random();
      let mesh: THREE.Mesh;
      let type: string;

      if (rand < 0.4) {
        mesh = new THREE.Mesh(boxGeo, greenMat);
        type = "BOX";
      } else if (rand < 0.7) {
        mesh = new THREE.Mesh(boxGeo, goldMat);
        type = "GOLD_BOX";
      } else if (rand < 0.92) {
        mesh = new THREE.Mesh(sphereGeo, goldMat);
        type = "GOLD_SPHERE";
      } else if (rand < 0.97) {
        mesh = new THREE.Mesh(sphereGeo, redMat);
        type = "RED";
      } else {
        mesh = new THREE.Mesh(candyGeo, candyMat);
        type = "CANE";
      }

      const s = 0.4 + Math.random() * 0.5;
      mesh.scale.set(s, s, s);
      mesh.rotation.set(
        Math.random() * 6,
        Math.random() * 6,
        Math.random() * 6
      );

      mainGroupRef.current.add(mesh);
      particleSystemRef.current.push(createParticle(mesh, type, false));
    }

    // Add star on top
    const starGeo = new THREE.OctahedronGeometry(1.2, 0);
    const starMat = new THREE.MeshStandardMaterial({
      color: 0xffdd88,
      emissive: 0xffaa00,
      emissiveIntensity: 1.0,
      metalness: 1.0,
      roughness: 0,
    });
    const star = new THREE.Mesh(starGeo, starMat);
    star.position.set(0, CONFIG.particles.treeHeight / 2 + 1.2, 0);
    mainGroupRef.current.add(star);
  };

  const createDust = () => {
    if (!mainGroupRef.current) return;

    const geo = new THREE.TetrahedronGeometry(0.08, 0);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffeebb,
      transparent: true,
      opacity: 0.8,
    });

    for (let i = 0; i < CONFIG.particles.dustCount; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.scale.setScalar(0.5 + Math.random());
      mainGroupRef.current.add(mesh);
      particleSystemRef.current.push(createParticle(mesh, "DUST", true));
    }
  };

  const createDefaultPhotos = () => {
    const remoteUrls = [
      "https://cos-1254079141.cos.ap-shanghai.myqcloud.com/picture/wedding/a_%2814%29%20%E6%8B%B7%E8%B4%9D.jpg",
      "https://cos-1254079141.cos.ap-shanghai.myqcloud.com/picture/wedding/a_%2818%29.jpg",
      "https://cos-1254079141.cos.ap-shanghai.myqcloud.com/picture/wedding/a_%282%29%20%E6%8B%B7%E8%B4%9D.jpg",
      "https://cos-1254079141.cos.ap-shanghai.myqcloud.com/picture/wedding/a_%2820%29%20%E6%8B%B7%E8%B4%9D.jpg",
      "https://cos-1254079141.cos.ap-shanghai.myqcloud.com/picture/wedding/a_%2826%29%20%E6%8B%B7%E8%B4%9D.jpg",
      "https://cos-1254079141.cos.ap-shanghai.myqcloud.com/picture/wedding/a_%2828%29%20%E6%8B%B7%E8%B4%9D.jpg",
      "https://cos-1254079141.cos.ap-shanghai.myqcloud.com/picture/wedding/a_%2831%29%20%E6%8B%B7%E8%B4%9D.jpg",
      "https://cos-1254079141.cos.ap-shanghai.myqcloud.com/picture/wedding/a_%2834%29.jpg",
      "https://cos-1254079141.cos.ap-shanghai.myqcloud.com/picture/wedding/a_%2837%29.jpg",
      "https://cos-1254079141.cos.ap-shanghai.myqcloud.com/picture/wedding/a_%2838%29%20%E6%8B%B7%E8%B4%9D.jpg",
    ];

    const photosCompressUrls = remoteUrls.map(
      (item) => item + "?imageView2/2/q/30/format/jpg"
    );

    photosCompressUrls.forEach((url) => {
      const textureLoader = new THREE.TextureLoader();
      textureLoader.load(url, (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        addPhotoToScene(texture);
      });
    });
  };

  const addPhotoToScene = (texture: THREE.Texture) => {
    if (!mainGroupRef.current) return;

    const aspectRatio = texture.image.width / texture.image.height;
    let width = 1.2;
    let height = 1.2;

    if (aspectRatio > 1) {
      height = 1.2 / aspectRatio;
    } else {
      width = 1.2 * aspectRatio;
    }

    const frameGeo = new THREE.BoxGeometry(width + 0.2, height + 0.2, 0.05);
    const frameMat = new THREE.MeshStandardMaterial({
      color: CONFIG.colors.champagneGold,
      metalness: 1.0,
      roughness: 0.1,
    });
    const frame = new THREE.Mesh(frameGeo, frameMat);

    const photoGeo = new THREE.PlaneGeometry(width, height);
    const photoMat = new THREE.MeshBasicMaterial({ map: texture });
    const photo = new THREE.Mesh(photoGeo, photoMat);
    photo.position.z = 0.04;

    const group = new THREE.Group();
    group.add(frame);
    group.add(photo);

    const s = 0.8;
    group.scale.set(s, s, s);

    mainGroupRef.current.add(group);
    particleSystemRef.current.push(createParticle(group, "PHOTO", false));
  };

  const createParticle = (
    mesh: THREE.Mesh | THREE.Group,
    type: string,
    isDust: boolean
  ): Particle => {
    const posTree = new THREE.Vector3();
    const posScatter = new THREE.Vector3();
    const baseScale = mesh.scale.x;

    const speedMult = type === "PHOTO" ? 0.3 : 2.0;
    const spinSpeed = new THREE.Vector3(
      (Math.random() - 0.5) * speedMult,
      (Math.random() - 0.5) * speedMult,
      (Math.random() - 0.5) * speedMult
    );

    // Calculate tree position (spiral)
    const h = CONFIG.particles.treeHeight;
    const halfH = h / 2;
    let t = Math.random();
    t = Math.pow(t, 0.8);
    const y = t * h - halfH;
    let rMax = CONFIG.particles.treeRadius * (1.0 - t);
    if (rMax < 0.5) rMax = 0.5;
    const angle = t * 50 * Math.PI + Math.random() * Math.PI;
    const r = rMax * (0.8 + Math.random() * 0.4);
    posTree.set(Math.cos(angle) * r, y, Math.sin(angle) * r);

    // Calculate scatter position (sphere)
    let rScatter = isDust ? 12 + Math.random() * 20 : 8 + Math.random() * 12;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    posScatter.set(
      rScatter * Math.sin(phi) * Math.cos(theta),
      rScatter * Math.sin(phi) * Math.sin(theta),
      rScatter * Math.cos(phi)
    );

    // Start from scattered position, will converge to tree
    mesh.position.copy(posScatter);

    return {
      mesh,
      type,
      isDust,
      posTree,
      posScatter,
      baseScale,
      spinSpeed,
    };
  };

  const setupPostProcessing = () => {
    if (!sceneRef.current || !cameraRef.current || !rendererRef.current) return;

    const renderScene = new RenderPass(sceneRef.current, cameraRef.current);
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      1.5,
      0.4,
      0.85
    );
    bloomPass.threshold = 0.7;
    bloomPass.strength = 0.45;
    bloomPass.radius = 0.4;

    const composer = new EffectComposer(rendererRef.current);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);
    composerRef.current = composer;
  };

  return (
    <>
      <div ref={containerRef} className="christmas-tree-container" />
      {!isInitialized && (
        <div className="tree-loader">
          <div className="tree-spinner"></div>
          <div className="tree-loader-text">Loading Christmas Magic...</div>
        </div>
      )}
    </>
  );
}
