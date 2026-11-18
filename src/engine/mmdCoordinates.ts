import * as THREE from 'three';
import type { Quat4, Vec3 } from './types';

/**
 * Coordinate conversions between MikuMikuDance (Left-Handed, +X anatomical left, +Y up, -Z front)
 * and Three.js (Right-Handed, +X anatomical left, +Y up, +Z front).
 *
 * Reflection across the XY plane (S = diag(1, 1, -1)):
 *   Position:   (x, y, z) -> (x, y, -z)
 *   Quaternion: (x, y, z, w) -> (-x, -y, z, w)
 */

export function mmdVecToThree(v: Vec3): THREE.Vector3 {
  return new THREE.Vector3(v[0], v[1], -v[2]);
}

export function threeVecToMmd(v: THREE.Vector3 | Vec3): Vec3 {
  if (Array.isArray(v)) {
    return [v[0], v[1], -v[2]];
  }
  return [v.x, v.y, -v.z];
}

export function mmdQuatToThree(q: Quat4): THREE.Quaternion {
  const out = new THREE.Quaternion(-q[0], -q[1], q[2], q[3]);
  return out.normalize();
}

export function threeQuatToMmd(q: THREE.Quaternion | Quat4): Quat4 {
  const qx = Array.isArray(q) ? q[0] : q.x;
  const qy = Array.isArray(q) ? q[1] : q.y;
  const qz = Array.isArray(q) ? q[2] : q.z;
  const qw = Array.isArray(q) ? q[3] : q.w;
  const len = Math.hypot(qx, qy, qz, qw) || 1;
  return [-qx / len, -qy / len, qz / len, qw / len];
}

export function normalizeQuat(q: Quat4): Quat4 {
  const len = Math.hypot(q[0], q[1], q[2], q[3]);
  if (len < 1e-8) return [0, 0, 0, 1];
  return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
}

export function cleanFloat(n: number, epsilon = 1e-6): number {
  if (!Number.isFinite(n) || Math.abs(n) < epsilon) return 0;
  return Number(n.toFixed(6));
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Swing-twist decomposition of a quaternion `q` around a normalized axis `twistAxis`.
 * q = swing * twist
 */
export function decomposeSwingTwist(
  q: THREE.Quaternion,
  twistAxis: THREE.Vector3
): { swing: THREE.Quaternion; twist: THREE.Quaternion } {
  const axis = twistAxis.clone().normalize();
  const r = new THREE.Vector3(q.x, q.y, q.z);
  const proj = axis.clone().multiplyScalar(r.dot(axis));
  const twist = new THREE.Quaternion(proj.x, proj.y, proj.z, q.w);
  if (twist.lengthSq() < 1e-10) {
    twist.set(0, 0, 0, 1);
  } else {
    twist.normalize();
  }
  const swing = q.clone().multiply(twist.clone().invert()).normalize();
  return { swing, twist };
}
