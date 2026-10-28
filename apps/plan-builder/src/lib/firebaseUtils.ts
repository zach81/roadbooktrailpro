import { db } from './firebase';
import { collection, doc, writeBatch, getDocs, getDoc, setDoc, deleteDoc, query } from 'firebase/firestore';

export interface AthleteData {
  id: string;
  name: string;
  [key: string]: any;
}

export interface IntervalsCredentials {
  athleteId: string;
  apiKey: string;
}

/**
 * Supprime récursivement les clés ayant la valeur `undefined` pour éviter l'erreur
 * FirebaseError: Unsupported field value: undefined dans Firestore.
 */
function stripUndefined<T>(value: T): T {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)).filter((item) => item !== undefined) as unknown as T;
  }
  if (typeof value === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(value as Record<string, any>)) {
      if (v !== undefined) {
        cleaned[k] = stripUndefined(v);
      }
    }
    return cleaned as T;
  }
  return value;
}

/**
 * Nettoie les anciennes clés localStorage non-scopées qui causaient des fuites
 * de données entre comptes sur un même navigateur.
 */
export function purgeLegacyUnscopedStorage() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem('intervalsAthleteId');
    localStorage.removeItem('intervalsApiKey');
  } catch {
    // ignore
  }
}

/**
 * Récupère les identifiants Intervals.icu strictement rattachés au compte connecté (`uid`).
 * Stockés de manière isolée dans `coaches/{uid}` (champ privé protégé par les règles Firestore
 * où seul `request.auth.uid == coachId` peut lire/écrire) + cache localStorage scopé par `uid`.
 */
export async function getUserIntervalsCredentials(uid?: string | null): Promise<IntervalsCredentials> {
  if (!uid) return { athleteId: '', apiKey: '' };
  purgeLegacyUnscopedStorage();

  const scopedIdKey = `mykairn_intervals_id_${uid}`;
  const scopedApiKey = `mykairn_intervals_key_${uid}`;

  try {
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const uData = userSnap.data();
      const uId = (uData?.intervalsAthleteId || '').trim();
      const uKey = (uData?.intervalsApiKey || '').trim();
      if (uId && uKey) {
        if (typeof window !== 'undefined') {
          localStorage.setItem(scopedIdKey, uId);
          localStorage.setItem(scopedApiKey, uKey);
        }
        return { athleteId: uId, apiKey: uKey };
      }
    }

    const coachRef = doc(db, 'coaches', uid);
    const snap = await getDoc(coachRef);
    if (snap.exists()) {
      const data = snap.data();
      const fbId = (data?.intervalsAthleteId || '').trim();
      const fbKey = (data?.intervalsApiKey || '').trim();
      if (fbId && fbKey) {
        if (typeof window !== 'undefined') {
          localStorage.setItem(scopedIdKey, fbId);
          localStorage.setItem(scopedApiKey, fbKey);
        }
        return { athleteId: fbId, apiKey: fbKey };
      }
    }
  } catch (error) {
    // Non-admins reading coaches/{uid} will fall back to users/{uid} or scoped cache
  }

  if (typeof window !== 'undefined') {
    const cachedId = (localStorage.getItem(scopedIdKey) || '').trim();
    const cachedKey = (localStorage.getItem(scopedApiKey) || '').trim();
    if (cachedId && cachedKey) {
      return { athleteId: cachedId, apiKey: cachedKey };
    }
  }

  return { athleteId: '', apiKey: '' };
}

/**
 * Sauvegarde les identifiants Intervals.icu strictement pour le compte connecté (`uid`)
 * dans `coaches/{uid}` (protégé par `request.auth.uid == coachId`) et dans le cache scopé par `uid`.
 */
export async function saveUserIntervalsCredentials(
  uid: string,
  athleteId: string,
  apiKey: string
): Promise<void> {
  if (!uid) throw new Error('Vous devez être connecté pour enregistrer vos identifiants Intervals.icu.');
  purgeLegacyUnscopedStorage();

  const cleanId = athleteId.trim();
  const cleanKey = apiKey.trim();
  const scopedIdKey = `mykairn_intervals_id_${uid}`;
  const scopedApiKey = `mykairn_intervals_key_${uid}`;

  if (typeof window !== 'undefined') {
    if (cleanId) localStorage.setItem(scopedIdKey, cleanId);
    else localStorage.removeItem(scopedIdKey);

    if (cleanKey) localStorage.setItem(scopedApiKey, cleanKey);
    else localStorage.removeItem(scopedApiKey);
  }

  const payload = stripUndefined({
    intervalsAthleteId: cleanId,
    intervalsApiKey: cleanKey,
    updatedAt: new Date().toISOString(),
  });

  // Toujours sauvegarder dans users/{uid} (accessible par tout utilisateur connecté pour son propre profil)
  const userRef = doc(db, 'users', uid);
  await setDoc(userRef, payload, { merge: true });

  // Sauvegarder également dans coaches/{uid} si le compte est administrateur
  try {
    const coachRef = doc(db, 'coaches', uid);
    await setDoc(coachRef, payload, { merge: true });
  } catch {
    // Ignoré si l'utilisateur n'est pas admin (coaches/{uid} est réservé aux admins)
  }
}

/**
 * Sauvegarde une liste d'athlètes dans Firestore et supprime les anciens athlètes obsolètes
 * pour que la liste reflète exactement le compte Intervals.icu du coach connecté.
 * Chemin : coaches/{coachId}/athletes/{athleteId}
 */
export async function saveAthletesToFirebase(coachId: string, athletes: AthleteData[]) {
  if (!coachId || !athletes) return;

  try {
    const batch = writeBatch(db);
    const athletesRef = collection(db, 'coaches', coachId, 'athletes');

    // Supprimer les anciens athlètes qui ne font plus partie de la synchronisation actuelle de cet utilisateur
    const existingSnap = await getDocs(query(athletesRef));
    const currentIds = new Set(athletes.map((a) => String(a.id)));
    existingSnap.forEach((docSnap) => {
      if (!currentIds.has(docSnap.id)) {
        batch.delete(docSnap.ref);
      }
    });

    athletes.forEach(athlete => {
      const docRef = doc(athletesRef, String(athlete.id));
      const cleanAthlete = stripUndefined({
        ...athlete,
        id: String(athlete.id),
        ownerUid: coachId,
        lastUpdated: new Date().toISOString()
      });
      batch.set(docRef, cleanAthlete, { merge: true });
    });

    await batch.commit();
    console.log(`[Firebase] ${athletes.length} athlètes sauvegardés avec succès pour le compte ${coachId}.`);
  } catch (error) {
    console.error('[Firebase] Erreur lors de la sauvegarde des athlètes :', error);
  }
}

/**
 * Récupère la liste des athlètes sauvegardés pour un coach donné depuis Firestore.
 */
export async function getAthletesFromFirebase(coachId: string): Promise<AthleteData[]> {
  if (!coachId) return [];

  try {
    const athletesRef = collection(db, 'coaches', coachId, 'athletes');
    const q = query(athletesRef);
    const querySnapshot = await getDocs(q);
    
    const athletesMap = new Map<string, AthleteData>();
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data() as AthleteData;
      const id = String(data.id || docSnap.id);
      if (!athletesMap.has(id)) {
        athletesMap.set(id, { ...data, id });
      }
    });

    return Array.from(athletesMap.values());
  } catch (error) {
    console.error('[Firebase] Erreur lors de la récupération des athlètes :', error);
    return [];
  }
}

/**
 * Bibliothèque de Séances (Templates)
 */
export async function saveWorkoutTemplate(coachId: string, workout: any) {
  if (!coachId || !workout) return;
  try {
    const templateRef = doc(db, 'coaches', coachId, 'templates', workout.id);
    const cleanWorkout = stripUndefined({
      ...workout,
      ownerUid: coachId,
      isTemplate: true,
      lastUpdated: new Date().toISOString()
    });
    await setDoc(templateRef, cleanWorkout, { merge: true });
    console.log(`[Firebase] Template ${workout.name} sauvegardé avec succès.`);
  } catch (error) {
    console.error('[Firebase] Erreur lors de la sauvegarde du template :', error);
    throw error;
  }
}

export async function deleteWorkoutTemplate(coachId: string, templateId: string) {
  if (!coachId || !templateId) return;
  try {
    const templateRef = doc(db, 'coaches', coachId, 'templates', templateId);
    await deleteDoc(templateRef);
    console.log(`[Firebase] Template ${templateId} supprimé avec succès.`);
  } catch (error) {
    console.error('[Firebase] Erreur lors de la suppression du template :', error);
    throw error;
  }
}

export async function getWorkoutTemplates(coachId: string): Promise<any[]> {
  if (!coachId) return [];
  try {
    const templatesRef = collection(db, 'coaches', coachId, 'templates');
    const q = query(templatesRef);
    const querySnapshot = await getDocs(q);
    
    const templates: any[] = [];
    querySnapshot.forEach((doc) => {
      templates.push(doc.data());
    });
    return templates;
  } catch (error) {
    console.error('[Firebase] Erreur lors de la récupération des templates :', error);
    return [];
  }
}

/**
 * Sauvegarde complète d'un plan pour un athlète
 */
export async function saveAthletePlan(coachId: string, athleteId: string, planData: { macrocycle: any, workouts: any[], config: any }) {
  if (!coachId || !athleteId || !planData.macrocycle) return;
  try {
    const planRef = doc(db, 'coaches', coachId, 'athletes', athleteId, 'plans', planData.macrocycle.id);
    const cleanPlan = stripUndefined({
      macrocycle: planData.macrocycle,
      workouts: planData.workouts,
      config: planData.config,
      ownerUid: coachId,
      lastUpdated: new Date().toISOString()
    });
    await setDoc(planRef, cleanPlan, { merge: true });
    console.log(`[Firebase] Plan ${planData.macrocycle.id} sauvegardé avec succès pour l'athlète ${athleteId}.`);
  } catch (error) {
    console.error('[Firebase] Erreur lors de la sauvegarde du plan :', error);
    throw error;
  }
}

export async function getAthletePlans(coachId: string, athleteId: string): Promise<any[]> {
  if (!coachId || !athleteId) return [];
  try {
    const plansRef = collection(db, 'coaches', coachId, 'athletes', athleteId, 'plans');
    const q = query(plansRef);
    const querySnapshot = await getDocs(q);
    
    const plans: any[] = [];
    querySnapshot.forEach((doc) => {
      plans.push(doc.data());
    });
    return plans;
  } catch (error) {
    console.error('[Firebase] Erreur lors de la récupération des plans :', error);
    return [];
  }
}
