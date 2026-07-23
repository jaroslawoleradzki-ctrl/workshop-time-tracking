export interface BrandingConfig {
  appName: string;
  appTitle: string;
  appDescription: string;
  isDemo: boolean;
  brandingName: string;
  logoLightPath: string; // Used on dark background
  logoDarkPath: string;  // Used on light background
}

export const branding: BrandingConfig = {
  appName: import.meta.env.VITE_APP_NAME || 'LaserCAD Time Tracking',
  appTitle: import.meta.env.VITE_APP_TITLE || 'LaserCAD Rozliczenie Czasu Pracy',
  appDescription: import.meta.env.VITE_APP_DESCRIPTION || 'System rejestracji i rozliczania czasu pracy LaserCAD',
  isDemo: import.meta.env.VITE_APP_DEMO === 'true',
  brandingName: import.meta.env.VITE_BRANDING || 'lasercad',
  logoLightPath: `/branding/${import.meta.env.VITE_BRANDING || 'lasercad'}/lasercad-logo-light.svg`,
  logoDarkPath: `/branding/${import.meta.env.VITE_BRANDING || 'lasercad'}/lasercad-logo-dark.svg`,
};
