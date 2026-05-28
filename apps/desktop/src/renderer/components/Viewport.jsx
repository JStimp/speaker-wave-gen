import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export default function Viewport({ mesh }) {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#11161a");
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(38, 1, 1, 5000);
    camera.position.set(720, 560, 820);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);

    scene.add(new THREE.AmbientLight("#d8ecff", 1.2));
    const key = new THREE.DirectionalLight("#ffffff", 2.2);
    key.position.set(600, 800, 900);
    scene.add(key);
    const fill = new THREE.DirectionalLight("#9ec4ff", 0.8);
    fill.position.set(-700, -300, 500);
    scene.add(fill);

    const grid = new THREE.GridHelper(1000, 20, "#2d3941", "#202930");
    grid.position.y = -430;
    scene.add(grid);

    const resize = () => {
      const bounds = container.getBoundingClientRect();
      renderer.setSize(bounds.width, bounds.height, false);
      camera.aspect = bounds.width / bounds.height;
      camera.updateProjectionMatrix();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      scene.traverse((object) => {
        object.geometry?.dispose?.();
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach((material) => material.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const old = scene.getObjectByName("wave-preview-root");
    if (old) {
      scene.remove(old);
      disposeObject(old);
    }

    const root = new THREE.Group();
    root.name = "wave-preview-root";
    root.add(createSurfaceMesh(mesh));
    root.add(createHeightWire(mesh));
    root.add(createSeamLines(mesh.overlays.seams.lines));
    root.add(createDriverLines(mesh.overlays.drivers));
    scene.add(root);
  }, [mesh]);

  return (
    <section className="viewport-shell">
      <div className="viewport" ref={containerRef} />
      <div className="viewport-hud">
        <span>Orbit</span>
        <span>Pan</span>
        <span>Zoom</span>
      </div>
    </section>
  );
}

function createSurfaceMesh(mesh) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(mesh.vertices, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(mesh.normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(heightColors(mesh.heights), 3));
  geometry.setIndex(mesh.indices);
  geometry.computeBoundingSphere();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.72,
    metalness: 0.03,
    side: THREE.DoubleSide
  });

  const object = new THREE.Mesh(geometry, material);
  object.name = "wave-relief-surface";
  return object;
}

function createHeightWire(mesh) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(mesh.vertices, 3));
  geometry.setIndex(mesh.indices);

  const wire = new THREE.WireframeGeometry(geometry);
  geometry.dispose();

  const material = new THREE.LineBasicMaterial({
    color: "#d6e6ef",
    transparent: true,
    opacity: 0.12
  });

  return new THREE.LineSegments(wire, material);
}

function createDriverLines(drivers) {
  const group = new THREE.Group();
  group.name = "driver-overlays";

  for (const driver of drivers) {
    const points = driver.points.map((point) => new THREE.Vector3(point.x, point.y, point.z));
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: "#f5c542", linewidth: 2 });
    group.add(new THREE.Line(geometry, material));
  }

  return group;
}

function createSeamLines(lines) {
  const positions = [];
  for (const line of lines) {
    positions.push(line.a.x, line.a.y, line.a.z);
    positions.push(line.b.x, line.b.y, line.b.z);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));

  const material = new THREE.LineBasicMaterial({
    color: "#ffffff",
    transparent: true,
    opacity: 0.55
  });

  const object = new THREE.LineSegments(geometry, material);
  object.name = "seam-overlays";
  return object;
}

function heightColors(heights) {
  const min = Math.min(...heights);
  const max = Math.max(...heights);
  const span = Math.max(0.0001, max - min);
  const low = new THREE.Color("#245f73");
  const mid = new THREE.Color("#d7b36a");
  const high = new THREE.Color("#f1f4ec");
  const colors = [];

  for (const height of heights) {
    const t = (height - min) / span;
    const color = t < 0.55
      ? low.clone().lerp(mid, t / 0.55)
      : mid.clone().lerp(high, (t - 0.55) / 0.45);
    colors.push(color.r, color.g, color.b);
  }

  return colors;
}

function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose?.();
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((material) => material.dispose());
      } else {
        child.material.dispose();
      }
    }
  });
}
