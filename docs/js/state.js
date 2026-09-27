export function runtimeFromSettings(settings) {
  return {
    ...settings,
    inversion_ritmica: !!settings.inversion_ritmica,
    default_wave: settings.modelo_onda,
    word_counter: 0,
    runtime_seed: settings.audio_seed === 0
      ? ((Math.random() * 0xFFFFFFFF) >>> 0)
      : (settings.audio_seed >>> 0)
  };
}

export function stateLines(st) {
  return [
    `centro_sonoro       = ${st.centro_sonoro}`,
    `dispersion          = ${st.dispersion}`,
    `suavidad_ritmica    = ${st.suavidad_ritmica}`,
    `inversion_ritmica   = ${st.inversion_ritmica ? 1 : 0}`,
    `lateralidad_sonora  = ${st.lateralidad_sonora}`,
    `ritmo_ms_modulo     = ${st.ritmo_ms_modulo}`,
    `modelo_onda         = ${st.modelo_onda}`,
    `default_wave        = ${st.default_wave}`,
    `audio_volumen       = ${st.audio_volumen}`,
    `audio_seed          = ${st.audio_seed}`,
    `frecuencia_min      = ${st.frecuencia_min}`,
    `frecuencia_max      = ${st.frecuencia_max}`,
    `codebar_modo        = ${st.codebar_modo}`,
    `word_counter        = ${st.word_counter}`
  ];
}
