import { decodeShiftJIS } from './shiftJis';
import type {
  MorphPanelCategory,
  MorphType,
  PMXBone,
  PMXMaterial,
  PMXModelData,
  PMXMorph,
  Vec3,
} from './types';

class BinaryReader {
  private view: DataView;
  private bytes: Uint8Array;
  public offset = 0;

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
    this.bytes = new Uint8Array(buffer);
  }

  get remaining(): number {
    return this.bytes.length - this.offset;
  }

  private ensure(n: number) {
    if (this.offset + n > this.bytes.length) {
      throw new Error(`Unexpected end of file at offset ${this.offset} (needed ${n} bytes).`);
    }
  }

  readUint8(): number {
    this.ensure(1);
    return this.bytes[this.offset++];
  }

  readInt8(): number {
    this.ensure(1);
    const v = this.view.getInt8(this.offset);
    this.offset += 1;
    return v;
  }

  readUint16(): number {
    this.ensure(2);
    const v = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return v;
  }

  readInt16(): number {
    this.ensure(2);
    const v = this.view.getInt16(this.offset, true);
    this.offset += 2;
    return v;
  }

  readUint32(): number {
    this.ensure(4);
    const v = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return v;
  }

  readInt32(): number {
    this.ensure(4);
    const v = this.view.getInt32(this.offset, true);
    this.offset += 4;
    return v;
  }

  readFloat32(): number {
    this.ensure(4);
    const v = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return v;
  }

  readVec2(): [number, number] {
    return [this.readFloat32(), this.readFloat32()];
  }

  readVec3(): Vec3 {
    return [this.readFloat32(), this.readFloat32(), this.readFloat32()];
  }

  readVec4(): [number, number, number, number] {
    return [this.readFloat32(), this.readFloat32(), this.readFloat32(), this.readFloat32()];
  }

  readBytes(len: number): Uint8Array {
    this.ensure(len);
    const slice = this.bytes.subarray(this.offset, this.offset + len);
    this.offset += len;
    return slice;
  }

  skip(len: number) {
    this.ensure(len);
    this.offset += len;
  }

  readSignedIndex(size: number): number {
    if (size === 1) return this.readInt8();
    if (size === 2) return this.readInt16();
    if (size === 4) return this.readInt32();
    throw new Error(`Invalid index size ${size}.`);
  }

  readUnsignedIndex(size: number): number {
    if (size === 1) return this.readUint8();
    if (size === 2) return this.readUint16();
    if (size === 4) return this.readInt32();
    throw new Error(`Invalid unsigned index size ${size}.`);
  }

  readText(encoding: 'utf16le' | 'utf8'): string {
    const len = this.readInt32();
    if (len < 0 || len > 10_000_000) {
      throw new Error(`Invalid PMX text length (${len}). File may be corrupted.`);
    }
    if (len === 0) return '';
    const slice = this.readBytes(len);
    const decoder = new TextDecoder(encoding === 'utf16le' ? 'utf-16le' : 'utf-8');
    return decoder.decode(slice).replace(/\0+$/, '');
  }
}

function mapMorphPanel(panelCode: number): MorphPanelCategory {
  switch (panelCode) {
    case 1:
      return 'eyebrow';
    case 2:
      return 'eye';
    case 3:
      return 'mouth';
    case 4:
      return 'other';
    default:
      return 'system';
  }
}

function mapMorphType(typeCode: number): MorphType {
  switch (typeCode) {
    case 0:
      return 'group';
    case 1:
      return 'vertex';
    case 2:
      return 'bone';
    case 3:
    case 4:
    case 5:
    case 6:
    case 7:
      return 'uv';
    case 8:
      return 'material';
    case 9:
      return 'flip';
    case 10:
      return 'impulse';
    default:
      return 'other' as MorphType;
  }
}

export function parsePMX(buffer: ArrayBuffer, fileName = 'model.pmx'): PMXModelData {
  if (buffer.byteLength < 32) {
    throw new Error('PMX file is too small to contain a valid header.');
  }
  const reader = new BinaryReader(buffer);
  const magic = String.fromCharCode(...reader.readBytes(4));
  if (magic !== 'PMX ') {
    throw new Error(`Invalid PMX magic header "${magic}". Expected "PMX ".`);
  }

  const version = reader.readFloat32();
  if (version < 2.0 || version > 2.2) {
    throw new Error(`Unsupported PMX version ${version.toFixed(1)}. Expected 2.0 or 2.1.`);
  }

  const globalsCount = reader.readUint8();
  if (globalsCount < 8) {
    throw new Error(`Invalid PMX globals count (${globalsCount}).`);
  }
  const globals = reader.readBytes(globalsCount);
  const encoding: 'utf16le' | 'utf8' = globals[0] === 0 ? 'utf16le' : 'utf8';
  const additionalVec4Count = globals[1];
  const vertexIndexSize = globals[2];
  const textureIndexSize = globals[3];
  const materialIndexSize = globals[4];
  const boneIndexSize = globals[5];
  const morphIndexSize = globals[6];
  const rigidBodyIndexSize = globals[7];

  const name = reader.readText(encoding);
  const englishName = reader.readText(encoding);
  const comment = reader.readText(encoding);
  const englishComment = reader.readText(encoding);

  // Vertices
  const vertexCount = reader.readInt32();
  if (vertexCount < 0 || vertexCount > 2_000_000) {
    throw new Error(`Invalid PMX vertex count (${vertexCount}).`);
  }
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const skinIndices = new Uint16Array(vertexCount * 4);
  const skinWeights = new Float32Array(vertexCount * 4);

  for (let i = 0; i < vertexCount; i++) {
    const pos = reader.readVec3();
    const norm = reader.readVec3();
    const uv = reader.readVec2();
    positions[i * 3] = pos[0];
    positions[i * 3 + 1] = pos[1];
    positions[i * 3 + 2] = pos[2];
    normals[i * 3] = norm[0];
    normals[i * 3 + 1] = norm[1];
    normals[i * 3 + 2] = norm[2];
    uvs[i * 2] = uv[0];
    uvs[i * 2 + 1] = uv[1];

    for (let a = 0; a < additionalVec4Count; a++) {
      reader.skip(16);
    }

    const weightType = reader.readUint8();
    const si = i * 4;
    if (weightType === 0) {
      // BDEF1
      const b0 = Math.max(0, reader.readSignedIndex(boneIndexSize));
      skinIndices[si] = b0;
      skinWeights[si] = 1;
    } else if (weightType === 1) {
      // BDEF2
      const b0 = Math.max(0, reader.readSignedIndex(boneIndexSize));
      const b1 = Math.max(0, reader.readSignedIndex(boneIndexSize));
      const w0 = reader.readFloat32();
      skinIndices[si] = b0;
      skinIndices[si + 1] = b1;
      skinWeights[si] = w0;
      skinWeights[si + 1] = 1 - w0;
    } else if (weightType === 2 || weightType === 4) {
      // BDEF4 or QDEF
      const b0 = Math.max(0, reader.readSignedIndex(boneIndexSize));
      const b1 = Math.max(0, reader.readSignedIndex(boneIndexSize));
      const b2 = Math.max(0, reader.readSignedIndex(boneIndexSize));
      const b3 = Math.max(0, reader.readSignedIndex(boneIndexSize));
      const w0 = reader.readFloat32();
      const w1 = reader.readFloat32();
      const w2 = reader.readFloat32();
      const w3 = reader.readFloat32();
      skinIndices[si] = b0;
      skinIndices[si + 1] = b1;
      skinIndices[si + 2] = b2;
      skinIndices[si + 3] = b3;
      skinWeights[si] = w0;
      skinWeights[si + 1] = w1;
      skinWeights[si + 2] = w2;
      skinWeights[si + 3] = w3;
    } else if (weightType === 3) {
      // SDEF
      const b0 = Math.max(0, reader.readSignedIndex(boneIndexSize));
      const b1 = Math.max(0, reader.readSignedIndex(boneIndexSize));
      const w0 = reader.readFloat32();
      reader.skip(36); // C, R0, R1 vec3s
      skinIndices[si] = b0;
      skinIndices[si + 1] = b1;
      skinWeights[si] = w0;
      skinWeights[si + 1] = 1 - w0;
    } else {
      throw new Error(`Unknown PMX skin weight type ${weightType} at vertex ${i}.`);
    }

    reader.readFloat32(); // edge scale
  }

  // Faces / Indices
  const indexCount = reader.readInt32();
  if (indexCount < 0 || indexCount > 6_000_000) {
    throw new Error(`Invalid PMX face index count (${indexCount}).`);
  }
  const indices = new Uint32Array(indexCount);
  for (let i = 0; i < indexCount; i++) {
    indices[i] = reader.readUnsignedIndex(vertexIndexSize);
  }

  // Textures
  const textureCount = reader.readInt32();
  const textures: string[] = [];
  for (let i = 0; i < textureCount; i++) {
    textures.push(reader.readText(encoding));
  }

  // Materials
  const materialCount = reader.readInt32();
  const materials: PMXMaterial[] = [];
  for (let i = 0; i < materialCount; i++) {
    const matName = reader.readText(encoding);
    const matEn = reader.readText(encoding);
    const diffuse = reader.readVec4();
    const specular = reader.readVec3();
    const specularity = reader.readFloat32();
    const ambient = reader.readVec3();
    const drawFlags = reader.readUint8();
    const edgeColor = reader.readVec4();
    const edgeSize = reader.readFloat32();
    const textureIndex = reader.readSignedIndex(textureIndexSize);
    const sphereTextureIndex = reader.readSignedIndex(textureIndexSize);
    const sphereMode = reader.readUint8();
    const toonFlag = reader.readUint8();
    const toonIndex = toonFlag === 0 ? reader.readSignedIndex(textureIndexSize) : reader.readUint8();
    reader.readText(encoding); // memo
    const faceCount = reader.readInt32();
    materials.push({
      name: matName,
      englishName: matEn,
      diffuse,
      specular,
      specularity,
      ambient,
      drawFlags,
      edgeColor,
      edgeSize,
      textureIndex,
      sphereTextureIndex,
      sphereMode,
      toonFlag,
      toonIndex,
      faceCount,
    });
  }

  // Bones
  const boneCount = reader.readInt32();
  if (boneCount < 0 || boneCount > 20_000) {
    throw new Error(`Invalid PMX bone count (${boneCount}).`);
  }
  const bones: PMXBone[] = [];
  for (let i = 0; i < boneCount; i++) {
    const boneName = reader.readText(encoding);
    const boneEn = reader.readText(encoding);
    const position = reader.readVec3();
    const parentIndex = reader.readSignedIndex(boneIndexSize);
    const transformLevel = reader.readInt32();
    const flags = reader.readUint16();

    const tailMode: 'offset' | 'bone' = (flags & 0x0001) !== 0 ? 'bone' : 'offset';
    let tailBoneIndex = -1;
    let tailOffset: Vec3 = [0, 0, 0];
    if (tailMode === 'bone') {
      tailBoneIndex = reader.readSignedIndex(boneIndexSize);
    } else {
      tailOffset = reader.readVec3();
    }

    const inheritRotation = (flags & 0x0100) !== 0;
    const inheritTranslation = (flags & 0x0200) !== 0;
    let inheritParentIndex = -1;
    let inheritRatio = 0;
    if (inheritRotation || inheritTranslation) {
      inheritParentIndex = reader.readSignedIndex(boneIndexSize);
      inheritRatio = reader.readFloat32();
    }

    const hasFixedAxis = (flags & 0x0400) !== 0;
    let fixedAxis: Vec3 = [0, 0, 0];
    if (hasFixedAxis) {
      fixedAxis = reader.readVec3();
    }

    const hasLocalAxis = (flags & 0x0800) !== 0;
    let localAxisX: Vec3 = [1, 0, 0];
    let localAxisZ: Vec3 = [0, 0, 1];
    if (hasLocalAxis) {
      localAxisX = reader.readVec3();
      localAxisZ = reader.readVec3();
    }

    const hasExternalParent = (flags & 0x2000) !== 0;
    if (hasExternalParent) {
      reader.readInt32();
    }

    const isIK = (flags & 0x0020) !== 0;
    let ikTargetIndex = -1;
    let ikLoopCount = 0;
    let ikLimitAngle = 0;
    const ikLinks: PMXBone['ikLinks'] = [];
    if (isIK) {
      ikTargetIndex = reader.readSignedIndex(boneIndexSize);
      ikLoopCount = reader.readInt32();
      ikLimitAngle = reader.readFloat32();
      const linkCount = reader.readInt32();
      for (let k = 0; k < linkCount; k++) {
        const boneIndex = reader.readSignedIndex(boneIndexSize);
        const hasLimits = reader.readUint8() !== 0;
        let minAngle: Vec3 = [0, 0, 0];
        let maxAngle: Vec3 = [0, 0, 0];
        if (hasLimits) {
          minAngle = reader.readVec3();
          maxAngle = reader.readVec3();
        }
        ikLinks.push({ boneIndex, hasLimits, minAngle, maxAngle });
      }
    }

    bones.push({
      index: i,
      name: boneName,
      englishName: boneEn,
      position,
      parentIndex,
      transformLevel,
      flags,
      tailMode,
      tailBoneIndex,
      tailOffset,
      rotatable: (flags & 0x0002) !== 0,
      translatable: (flags & 0x0004) !== 0,
      visible: (flags & 0x0008) !== 0,
      enabled: (flags & 0x0010) !== 0,
      isIK,
      inheritRotation,
      inheritTranslation,
      inheritParentIndex,
      inheritRatio,
      hasFixedAxis,
      fixedAxis,
      hasLocalAxis,
      localAxisX,
      localAxisZ,
      physicsAfterDeform: (flags & 0x1000) !== 0,
      ikTargetIndex,
      ikLoopCount,
      ikLimitAngle,
      ikLinks,
    });
  }

  // Morphs
  const morphs: PMXMorph[] = [];
  if (reader.remaining >= 4) {
    const morphCount = reader.readInt32();
    for (let i = 0; i < morphCount; i++) {
      const mName = reader.readText(encoding);
      const mEn = reader.readText(encoding);
      const panel = mapMorphPanel(reader.readUint8());
      const typeCode = reader.readUint8();
      const type = mapMorphType(typeCode);
      const offsetCount = reader.readInt32();

      const vertexOffsets: PMXMorph['vertexOffsets'] = [];
      const groupOffsets: PMXMorph['groupOffsets'] = [];

      for (let o = 0; o < offsetCount; o++) {
        if (typeCode === 0) {
          const morphIndex = reader.readSignedIndex(morphIndexSize);
          const ratio = reader.readFloat32();
          groupOffsets.push({ morphIndex, ratio });
        } else if (typeCode === 1) {
          const vertexIndex = reader.readUnsignedIndex(vertexIndexSize);
          const offset = reader.readVec3();
          vertexOffsets.push({ vertexIndex, offset });
        } else if (typeCode === 2) {
          reader.readSignedIndex(boneIndexSize);
          reader.skip(12 + 16); // vec3 pos + vec4 quat
        } else if (typeCode >= 3 && typeCode <= 7) {
          reader.readUnsignedIndex(vertexIndexSize);
          reader.skip(16); // vec4 uv
        } else if (typeCode === 8) {
          reader.readSignedIndex(materialIndexSize);
          reader.skip(1 + 16 + 12 + 4 + 12 + 16 + 4 + 16 + 16 + 16);
        } else if (typeCode === 9) {
          reader.readSignedIndex(morphIndexSize);
          reader.skip(4);
        } else if (typeCode === 10) {
          reader.readSignedIndex(rigidBodyIndexSize);
          reader.skip(1 + 4 + 12 + 12);
        }
      }

      morphs.push({
        index: i,
        name: mName,
        englishName: mEn,
        panel,
        type,
        vertexOffsets,
        groupOffsets,
      });
    }
  }

  return {
    format: 'PMX',
    version,
    fileName,
    name: name || fileName,
    englishName: englishName || name || fileName,
    comment,
    englishComment,
    vertexCount,
    positions,
    normals,
    uvs,
    skinIndices,
    skinWeights,
    indices,
    textures,
    materials,
    bones,
    morphs,
  };
}

export function parsePMD(buffer: ArrayBuffer, fileName = 'model.pmd'): PMXModelData {
  if (buffer.byteLength < 283) {
    throw new Error('PMD file is too small to contain a valid header.');
  }
  const reader = new BinaryReader(buffer);
  const magic = String.fromCharCode(...reader.readBytes(3));
  if (magic !== 'Pmd') {
    throw new Error(`Invalid PMD magic header "${magic}". Expected "Pmd".`);
  }
  const version = reader.readFloat32();
  const name = decodeShiftJIS(reader.readBytes(20));
  const comment = decodeShiftJIS(reader.readBytes(256));

  const vertexCount = reader.readUint32();
  if (vertexCount > 500_000) {
    throw new Error(`Invalid PMD vertex count (${vertexCount}).`);
  }
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const skinIndices = new Uint16Array(vertexCount * 4);
  const skinWeights = new Float32Array(vertexCount * 4);

  for (let i = 0; i < vertexCount; i++) {
    const pos = reader.readVec3();
    const norm = reader.readVec3();
    const uv = reader.readVec2();
    const b0 = reader.readUint16();
    const b1 = reader.readUint16();
    const w0 = reader.readUint8() / 100;
    reader.readUint8(); // edge flag

    positions[i * 3] = pos[0];
    positions[i * 3 + 1] = pos[1];
    positions[i * 3 + 2] = pos[2];
    normals[i * 3] = norm[0];
    normals[i * 3 + 1] = norm[1];
    normals[i * 3 + 2] = norm[2];
    uvs[i * 2] = uv[0];
    uvs[i * 2 + 1] = uv[1];
    skinIndices[i * 4] = b0;
    skinIndices[i * 4 + 1] = b1;
    skinWeights[i * 4] = w0;
    skinWeights[i * 4 + 1] = 1 - w0;
  }

  const indexCount = reader.readUint32();
  const indices = new Uint32Array(indexCount);
  for (let i = 0; i < indexCount; i++) {
    indices[i] = reader.readUint16();
  }

  const materialCount = reader.readUint32();
  const materials: PMXMaterial[] = [];
  const textures: string[] = [];
  for (let i = 0; i < materialCount; i++) {
    const diffuse = reader.readVec4();
    const specularity = reader.readFloat32();
    const specular = reader.readVec3();
    const ambient = reader.readVec3();
    const toonIndex = reader.readUint8();
    const edgeFlag = reader.readUint8();
    const faceCount = reader.readUint32();
    const texFile = decodeShiftJIS(reader.readBytes(20));
    let textureIndex = -1;
    if (texFile) {
      const baseTex = texFile.split('*')[0];
      if (baseTex) {
        textureIndex = textures.indexOf(baseTex);
        if (textureIndex === -1) {
          textureIndex = textures.length;
          textures.push(baseTex);
        }
      }
    }
    materials.push({
      name: `Material_${i}`,
      englishName: `Material_${i}`,
      diffuse,
      specular,
      specularity,
      ambient,
      drawFlags: edgeFlag ? 0x1f : 0x0f,
      edgeColor: [0, 0, 0, 1],
      edgeSize: 1,
      textureIndex,
      sphereTextureIndex: -1,
      sphereMode: 0,
      toonFlag: 1,
      toonIndex,
      faceCount,
    });
  }

  const boneCount = reader.readUint16();
  const bones: PMXBone[] = [];
  for (let i = 0; i < boneCount; i++) {
    const boneName = decodeShiftJIS(reader.readBytes(20));
    const parentIndex = reader.readInt16();
    const tailBoneIndex = reader.readInt16();
    const boneType = reader.readUint8();
    const ikParentIndex = reader.readInt16();
    const position = reader.readVec3();

    bones.push({
      index: i,
      name: boneName,
      englishName: boneName,
      position,
      parentIndex,
      transformLevel: 0,
      flags: boneType === 2 ? 0x0023 : 0x001b,
      tailMode: tailBoneIndex >= 0 ? 'bone' : 'offset',
      tailBoneIndex,
      tailOffset: [0, 0.5, 0],
      rotatable: boneType !== 7 && boneType !== 9,
      translatable: boneType === 1 || boneType === 2 || boneName === 'センター',
      visible: boneType !== 7 && boneType !== 9,
      enabled: true,
      isIK: boneType === 2,
      inheritRotation: boneType === 5 || boneType === 9,
      inheritTranslation: false,
      inheritParentIndex: ikParentIndex,
      inheritRatio: boneType === 5 || boneType === 9 ? 1 : 0,
      hasFixedAxis: false,
      fixedAxis: [0, 0, 0],
      hasLocalAxis: false,
      localAxisX: [1, 0, 0],
      localAxisZ: [0, 0, 1],
      physicsAfterDeform: false,
      ikTargetIndex: -1,
      ikLoopCount: 0,
      ikLimitAngle: 0,
      ikLinks: [],
    });
  }

  // PMD IK list
  if (reader.remaining >= 2) {
    const ikCount = reader.readUint16();
    for (let i = 0; i < ikCount; i++) {
      const ikBoneIndex = reader.readUint16();
      const targetBoneIndex = reader.readUint16();
      const chainLen = reader.readUint8();
      const iterations = reader.readUint16();
      const controlWeight = reader.readFloat32();
      const links: PMXBone['ikLinks'] = [];
      for (let k = 0; k < chainLen; k++) {
        const childIdx = reader.readUint16();
        const childBone = bones[childIdx];
        const isKnee = Boolean(childBone && /ひざ|knee/i.test(childBone.name));
        links.push({
          boneIndex: childIdx,
          hasLimits: isKnee,
          minAngle: isKnee ? [-Math.PI, 0, 0] : [0, 0, 0],
          maxAngle: isKnee ? [-0.01, 0, 0] : [0, 0, 0],
        });
      }
      if (bones[ikBoneIndex]) {
        bones[ikBoneIndex].isIK = true;
        bones[ikBoneIndex].ikTargetIndex = targetBoneIndex;
        bones[ikBoneIndex].ikLoopCount = iterations;
        bones[ikBoneIndex].ikLimitAngle = controlWeight * Math.PI;
        bones[ikBoneIndex].ikLinks = links;
      }
    }
  }

  // PMD Skin (Morphs)
  const morphs: PMXMorph[] = [];
  if (reader.remaining >= 2) {
    const skinCount = reader.readUint16();
    let baseVertexIndices: number[] = [];
    for (let i = 0; i < skinCount; i++) {
      const sName = decodeShiftJIS(reader.readBytes(20));
      const vCount = reader.readUint32();
      const skinType = reader.readUint8();
      const vertexOffsets: PMXMorph['vertexOffsets'] = [];
      if (skinType === 0) {
        baseVertexIndices = [];
        for (let v = 0; v < vCount; v++) {
          baseVertexIndices.push(reader.readUint32());
          reader.skip(12);
        }
      } else {
        for (let v = 0; v < vCount; v++) {
          const localIdx = reader.readUint32();
          const offset = reader.readVec3();
          vertexOffsets.push({
            vertexIndex: baseVertexIndices[localIdx] ?? localIdx,
            offset,
          });
        }
        morphs.push({
          index: morphs.length,
          name: sName,
          englishName: sName,
          panel: mapMorphPanel(skinType),
          type: 'vertex',
          vertexOffsets,
          groupOffsets: [],
        });
      }
    }
  }

  return {
    format: 'PMD',
    version,
    fileName,
    name: name || fileName,
    englishName: name || fileName,
    comment,
    englishComment: comment,
    vertexCount,
    positions,
    normals,
    uvs,
    skinIndices,
    skinWeights,
    indices,
    textures,
    materials,
    bones,
    morphs,
  };
}

export function parseMMDModel(buffer: ArrayBuffer, fileName: string): PMXModelData {
  if (buffer.byteLength < 8) {
    throw new Error(`File "${fileName}" is empty or too small.`);
  }
  const header = new Uint8Array(buffer, 0, 4);
  const magic4 = String.fromCharCode(...header);
  if (magic4 === 'PMX ') {
    return parsePMX(buffer, fileName);
  }
  if (magic4.startsWith('Pmd')) {
    return parsePMD(buffer, fileName);
  }
  throw new Error(
    `Unsupported model format in "${fileName}". Expected binary PMX ("PMX ") or PMD ("Pmd").`
  );
}
