export type WeatherIconKind =
  | 'sun'
  | 'moon'
  | 'partly-day'
  | 'partly-night'
  | 'cloud'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'storm';

export interface WeatherCodeInfo {
  label: string;
  icon: WeatherIconKind;
}

export function describeWeatherCode(code: number, isDay = true): WeatherCodeInfo {
  switch (code) {
    case 0:
      return { label: isDay ? 'Céu limpo' : 'Noite limpa', icon: isDay ? 'sun' : 'moon' };
    case 1:
      return { label: 'Predominantemente limpo', icon: isDay ? 'partly-day' : 'partly-night' };
    case 2:
      return { label: 'Parcialmente nublado', icon: isDay ? 'partly-day' : 'partly-night' };
    case 3:
      return { label: 'Nublado', icon: 'cloud' };
    case 45:
    case 48:
      return { label: 'Neblina', icon: 'fog' };
    case 51:
    case 53:
    case 55:
      return { label: 'Garoa', icon: 'drizzle' };
    case 56:
    case 57:
      return { label: 'Garoa gelada', icon: 'drizzle' };
    case 61:
      return { label: 'Chuva fraca', icon: 'rain' };
    case 63:
      return { label: 'Chuva moderada', icon: 'rain' };
    case 65:
      return { label: 'Chuva forte', icon: 'rain' };
    case 66:
    case 67:
      return { label: 'Chuva congelante', icon: 'rain' };
    case 71:
    case 73:
    case 75:
    case 77:
      return { label: 'Neve', icon: 'snow' };
    case 80:
    case 81:
    case 82:
      return { label: 'Pancadas de chuva', icon: 'rain' };
    case 85:
    case 86:
      return { label: 'Pancadas de neve', icon: 'snow' };
    case 95:
      return { label: 'Tempestade', icon: 'storm' };
    case 96:
    case 99:
      return { label: 'Tempestade com granizo', icon: 'storm' };
    default:
      return { label: 'Tempo variável', icon: isDay ? 'partly-day' : 'partly-night' };
  }
}

export function formatWeatherLocationShort(
  loc?: { name?: string; region?: string; country?: string } | null
): string {
  if (!loc?.name) return '';
  if (loc.region && loc.region.toLowerCase() !== loc.name.toLowerCase()) {
    return `${loc.name}, ${loc.region}`;
  }
  return loc.country ? `${loc.name}, ${loc.country}` : loc.name;
}
