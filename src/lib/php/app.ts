export interface FirebaseApp {
  options: Record<string, unknown>;
}

export function initializeApp(options: Record<string, unknown>, _name?: string): FirebaseApp {
  return { options };
}
