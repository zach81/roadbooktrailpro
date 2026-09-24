import { db } from './firebase';
import { collection, doc, writeBatch, getDocs, setDoc, query } from 'firebase/firestore';

export interface AthleteData {
  id: string;
  name: string;
  [key: string]: any;
}

/**
 * Sauvegarde une liste d'athlètes dans Firestore.
 * Chemin : coaches/{coachId}/athletes/{athleteId}
 */
export async function saveAthletesToFirebase(coachId: string, athletes: AthleteData[]) {
  if (!coachId || !athletes || athletes.length === 0) return;

  try {
    const batch = writeBatch(db);
    const athletesRef = collection(db, 'coaches', coachId, 'athletes');

    athletes.forEach(athlete => {
      const docRef = doc(athletesRef, athlete.id);
      batch.set(docRef, {
        ...athlete,
        lastUpdated: new Date().toISOString()
      }, { merge: true }); // merge: true permet de mettre à jour sans écraser d'autres données potentiellement ajoutées ailleurs
    });

    await batch.commit();
    console.log(`[Firebase] ${athletes.length} athlètes sauvegardés avec succès pour le coach ${coachId}.`);
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
    
    const athletes: AthleteData[] = [];
    querySnapshot.forEach((doc) => {
      athletes.push(doc.data() as AthleteData);
    });

    return athletes;
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
    await setDoc(templateRef, {
      ...workout,
      isTemplate: true,
      lastUpdated: new Date().toISOString()
    }, { merge: true });
    console.log(`[Firebase] Template ${workout.name} sauvegardé avec succès.`);
  } catch (error) {
    console.error('[Firebase] Erreur lors de la sauvegarde du template :', error);
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
    await setDoc(planRef, {
      macrocycle: planData.macrocycle,
      workouts: planData.workouts,
      config: planData.config,
      lastUpdated: new Date().toISOString()
    }, { merge: true });
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
