"use client";

import { Suspense, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useAnimations, useGLTF } from "@react-three/drei";

// 진짜 사람형 3D 모델 + 모캡 동작을 우리 앱 안에서 재생(React Three Fiber).
function Model({ url }: { url: string }) {
  const { scene, animations } = useGLTF(url);
  const { actions, names } = useAnimations(animations, scene);

  useEffect(() => {
    // 가만히 서있는 동작 우선(걷기는 등 보임)
    const name = names.find((n) => /idle/i.test(n)) ?? names[0];
    const action = name ? actions[name] : undefined;
    action?.reset().fadeIn(0.3).play();
    return () => {
      action?.fadeOut(0.3);
    };
  }, [actions, names]);

  // 카메라 쪽(앞)을 보도록 180° 회전
  return (
    <primitive
      object={scene}
      scale={1.4}
      position={[0, -1.4, 0]}
      rotation={[0, Math.PI, 0]}
    />
  );
}

export default function Avatar3D({ url }: { url: string }) {
  return (
    <Canvas
      camera={{ position: [0, 0.6, 3.4], fov: 45 }}
      style={{ height: 480, borderRadius: 12 }}
    >
      <color attach="background" args={["#0a0a0a"]} />
      <ambientLight intensity={0.9} />
      <directionalLight position={[3, 6, 4]} intensity={1.6} />
      <Suspense fallback={null}>
        <Model url={url} />
      </Suspense>
      <OrbitControls enablePan={false} minDistance={2} maxDistance={6} />
    </Canvas>
  );
}
