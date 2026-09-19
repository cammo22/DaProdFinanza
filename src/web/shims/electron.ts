/** Il poco di Electron che il backend tocca, per la versione Android. */
export const app = {
  getVersion: (): string => __APP_VERSION__,
  getPath: (): string => '/',
  setPath: (): void => undefined,
  commandLine: { hasSwitch: (): boolean => false }
}

export default { app }
