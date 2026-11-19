import * as THREE from 'three';

/*
 * Comic shading (art styles with `toon`): patches three's lit-material chunks, active only on
 * materials that carry the WD_TOON define (ArtStyle adds / removes it, one recompile per switch).
 *
 *  · two-tone light — the sun's N·L snaps to lit / shadow with a narrow soft band (a little
 *    form shading kept inside the lit side), so shapes read as flat planes of light and shadow;
 *  · hatching in shadow — fine diagonal pen lines anchored in world space (they stay on the
 *    object as the camera moves), only where the sun doesn't reach, fading with distance.
 */
let patched = false;

export function installComicShading(): void {
  if (patched) return;
  patched = true;
  const C = THREE.ShaderChunk as unknown as Record<string, string>;

  // a world-position varying for the hatching (vertex + fragment both include <common>)
  C.common += `
#ifdef WD_TOON
  varying vec3 vWdWorld;
#endif
`;
  C.project_vertex += `
#ifdef WD_TOON
  {
    vec4 wdW = vec4( transformed, 1.0 );
    #ifdef USE_BATCHING
      wdW = batchingMatrix * wdW;
    #endif
    #ifdef USE_INSTANCING
      wdW = instanceMatrix * wdW;
    #endif
    vWdWorld = ( modelMatrix * wdW ).xyz;
  }
#endif
`;

  // two-tone sun
  const dotLine = 'float dotNL = saturate( dot( geometryNormal, directLight.direction ) );';
  if (!C.lights_physical_pars_fragment.includes(dotLine)) {
    console.warn('[comic] three chunk changed — two-tone light disabled');
  } else {
    C.lights_physical_pars_fragment = C.lights_physical_pars_fragment.replace(
      dotLine,
      `${dotLine}
	#ifdef WD_TOON
		dotNL = mix( 0.1, 1.0, smoothstep( 0.06, 0.18, dotNL ) ) * mix( 0.8, 1.0, dotNL );
	#endif`,
    );
  }

  // hatching where the sun doesn't reach
  C.lights_fragment_end += `
#ifdef WD_TOON
  {
    float wdLd = dot( reflectedLight.directDiffuse, vec3( 0.299, 0.587, 0.114 ) );
    float wdAlb = max( dot( material.diffuseColor, vec3( 0.299, 0.587, 0.114 ) ), 0.02 );
    float wdShade = 1.0 - smoothstep( 0.2, 0.55, wdLd / wdAlb );
    float wdS = dot( vWdWorld, vec3( 0.62, 0.52, 0.58 ) ) * 6.5;
    float wdAA = fwidth( wdS );
    float wdLine = 1.0 - smoothstep( 0.1, 0.1 + wdAA * 1.5, abs( fract( wdS ) - 0.5 ) );
    float wdFade = ( 1.0 - smoothstep( 14.0, 34.0, length( vViewPosition ) ) ) * ( 1.0 - smoothstep( 0.25, 0.5, wdAA ) );
    float wdH = 1.0 - 0.42 * wdShade * wdLine * wdFade;
    reflectedLight.indirectDiffuse *= wdH;
    reflectedLight.directDiffuse *= wdH;
  }
#endif
`;
}

/** Is this material lit (so it can take the comic define)? */
export function isLit(m: THREE.Material): boolean {
  const x = m as THREE.Material & Record<string, boolean>;
  return !!(x.isMeshStandardMaterial || x.isMeshToonMaterial || x.isMeshLambertMaterial || x.isMeshPhongMaterial);
}
