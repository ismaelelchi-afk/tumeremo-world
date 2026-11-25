/**
 * Validación de GLB 2.0 compartida por el generador y el verificador del mundo.
 * Rechaza exactamente lo que el importador de STUDIO ya rechaza: cabecera incoherente,
 * chunks corruptos y URIs externas (que provocarían peticiones arbitrarias en el WORLD).
 */

const GLB_MAGIC = 0x46546c67; // 'glTF'
const GLB_VERSION = 2;
const CHUNK_JSON = 0x4e4f534a; // 'JSON'

export function validateGlbBuffer(buffer, label, errors) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    errors.push(`${label}: no se pudo decodificar un GLB con contenido.`);
    return;
  }

  if (buffer.length < 20) {
    errors.push(`${label}: demasiado corto para un GLB 2.0 válido (${buffer.length} bytes).`);
    return;
  }

  if (buffer.readUInt32LE(0) !== GLB_MAGIC) errors.push(`${label}: falta la cabecera mágica 'glTF'.`);
  if (buffer.readUInt32LE(4) !== GLB_VERSION) errors.push(`${label}: versión GLB no soportada (se espera 2).`);
  if (buffer.readUInt32LE(8) !== buffer.length) {
    errors.push(
      `${label}: la longitud declarada (${buffer.readUInt32LE(8)}) no coincide con los ${buffer.length} bytes decodificados.`,
    );
  }

  let offset = 12;
  let foundJson = false;
  while (offset + 8 <= buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset);
    const chunkType = buffer.readUInt32LE(offset + 4);
    if (offset + 8 + chunkLength > buffer.length) {
      errors.push(`${label}: chunk en ${offset} excede el final del archivo.`);
      return;
    }
    if (chunkType === CHUNK_JSON) {
      foundJson = true;
      let json;
      try {
        // TextDecoder (usado por STUDIO y GLTFLoader) elimina el BOM UTF-8; Buffer.toString no.
        const text = buffer.toString('utf8', offset + 8, offset + 8 + chunkLength).replace(/^\uFEFF/, '');
        json = JSON.parse(text);
      } catch {
        errors.push(`${label}: el chunk JSON no es válido.`);
      }
      if (json !== undefined) {
        const visit = (node) => {
          if (!node || typeof node !== 'object') return;
          if (Array.isArray(node)) {
            node.forEach(visit);
            return;
          }
          for (const [key, value] of Object.entries(node)) {
            if (key === 'uri' && typeof value === 'string' && !value.startsWith('data:')) {
              // No se volca la URI completa: podría contener tokens de firma en los logs.
              errors.push(`${label}: URI externa en el GLB (no data:); no se permite.`);
            }
            visit(value);
          }
        };
        visit(json);
      }
    }
    offset += 8 + chunkLength;
  }

  if (offset !== buffer.length) errors.push(`${label}: hay ${buffer.length - offset} bytes sobrantes tras los chunks.`);
  if (!foundJson) errors.push(`${label}: falta el chunk JSON obligatorio.`);
}
