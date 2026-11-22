import type { WeatherData } from '../types';

export interface WeatherHeroCopy {
  headline: string;
  accentSuffix: string;
  subtitle: string;
  bucket: string;
}

const MESSAGES_BY_BUCKET: Record<string, string[]> = {
  storm: [
    'Temporal lá fora — tá perfeito pra ver um filme ou série!',
    'Dia de trovoada combina demais com uma série maratonada.',
    'Fica no conforto curtindo uma música boa ou TV ao vivo!',
  ],
  rain: [
    'Clima de chuva: tá bom demais pra ver um filme ou uma série!',
    'Chuvinha pedindo uma música boa ou um filmão no capricho.',
    'Tempo chuvoso combina com rádio ao vivo ou aquela série!',
    'Barulhinho de chuva — escolhe uma música pra relaxar!',
  ],
  snow: [
    'Frio intenso! Ideal pra se enrolar e ver um filme.',
    'Clima congelante pede uma série boa ou música quentinha!',
    'Dia gelado perfeito pra maratonar vídeos e séries.',
  ],
  fog: [
    'Neblina lá fora — clima de cinema pra ver um filme!',
    'Com essa neblina, vai bem uma música calma ou rádio.',
    'Tempo misterioso lá fora: perfeito pra uma série!',
  ],
  cold: [
    'Friozinho pedindo cobertor, série ou um filmão!',
    'Clima fresco demais pra curtir uma música ou filme.',
    'Com esse frio, tá bom pra ver um filme ou uma série!',
    'Dia fresquinho combina com rádio ao vivo e música boa.',
  ],
  hot: [
    'Calor forte! Fica na sombra curtindo música ou TV ao vivo.',
    'Muito calor lá fora — bota uma rádio ou um filme!',
    'Clima quente pede uma playlist animada pra refrescar!',
    'Sol pegando fogo: ótimo pra relaxar vendo uma série.',
  ],
  sunny: [
    'Dia lindo! Bota uma música animada pra embalar o momento!',
    'Solzão lá fora — escolhe uma rádio ou sua playlist favorita!',
    'Tempo aberto combina com música boa ou TV ao vivo!',
    'Sol brilhando! Dá o play nas suas músicas preferidas.',
  ],
  clear_night: [
    'Noite tranquila — tá bom demais pra ver um filme ou série!',
    'Clima de noite combina com uma música relaxante.',
    'Noite estrelada pedindo um filmão ou rádio noturna!',
    'Fim de dia perfeito pra curtir uma série ou escutar música.',
  ],
  cloudy: [
    'Tempo nublado — tá ótimo pra ver um filme ou uma série!',
    'Céu fechadinho combina demais com uma música boa.',
    'Clima tranquilo: escolhe uma rádio, filme ou série!',
    'Nuvens no céu pedem uma playlist ou TV ao vivo.',
  ],
};

/**
 * Generates a weather-reactive Home hero greeting + randomly selected relaxed suggestion
 * tailored to the current weather condition. Returns `null` when weather is OFF/unavailable
 * so the Home screen preserves its default "Seu som. Sua tela." copy.
 */
export function getWeatherHomeHero(
  weatherData: WeatherData | null,
  seed: number
): WeatherHeroCopy | null {
  if (!weatherData || !weatherData.current) return null;

  const { weatherCode: code, isDay, temp } = weatherData.current;
  const roundedTemp = Math.round(temp);

  let bucket = 'cloudy';
  let headline = isDay ? 'Céu nublado' : 'Noite nublada';

  if (code >= 95) {
    bucket = 'storm';
    headline = 'Tempestade lá fora';
  } else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    bucket = 'rain';
    headline = 'Chuvinha lá fora';
  } else if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    bucket = 'snow';
    headline = 'Tempo gelado';
  } else if (code === 45 || code === 48) {
    bucket = 'fog';
    headline = 'Tempo com neblina';
  } else if (roundedTemp <= 16) {
    bucket = 'cold';
    headline = 'Friozinho bom';
  } else if (roundedTemp >= 30) {
    bucket = 'hot';
    headline = 'Calorzão lá fora';
  } else if (code <= 1 && isDay) {
    bucket = 'sunny';
    headline = 'Dia ensolarado';
  } else if (code <= 1 && !isDay) {
    bucket = 'clear_night';
    headline = 'Noite estrelada';
  }

  const pool = MESSAGES_BY_BUCKET[bucket] ?? MESSAGES_BY_BUCKET.cloudy;
  const idx = Math.abs(seed) % pool.length;

  return {
    headline,
    accentSuffix: `${roundedTemp}°C`,
    subtitle: pool[idx],
    bucket,
  };
}
