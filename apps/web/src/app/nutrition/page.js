"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { 
  collection, doc, getDoc, updateDoc, setDoc, deleteDoc, 
  query, where, getDocs, or 
} from "firebase/firestore";
import { Search, Star, Droplet, Cookie, Zap, Plus, Trash2, Edit } from "lucide-react";
import styles from "./nutrition.module.css";
// On garde ça juste pour la migration initiale
import { nutritionDatabase } from "@/lib/nutritionData"; 

export default function NutritionPage() {
  const { currentUser, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [brandFilter, setBrandFilter] = useState("All");
  
  const [favorites, setFavorites] = useState([]);
  const [products, setProducts] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  // Modale d'ajout/édition
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    brand: "",
    type: "Gel",
    carbs: "",
    calories: "",
    sodium: "",
    water: "",
    weight: "",
    isOfficial: false
  });

  useEffect(() => {
    if (authLoading) return;
    if (!currentUser) {
      router.push("/login");
      return;
    }

    async function loadData() {
      try {
        // Charger les infos de l'utilisateur (favoris et role)
        const userDocRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userDocRef);
        let userIsAdmin = false;
        if (userSnap.exists()) {
          const data = userSnap.data();
          if (data.favoriteNutrition) {
            setFavorites(data.favoriteNutrition);
          }
          if (data.role === 'admin') {
            setIsAdmin(true);
            userIsAdmin = true;
          }
        }

        // Charger les produits (Officiels OU appartenant à l'utilisateur)
        const q = query(
          collection(db, "nutrition_products"),
          or(
            where("isOfficial", "==", true),
            where("userId", "==", currentUser.uid)
          )
        );
        const productsSnap = await getDocs(q);
        const loadedProducts = productsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setProducts(loadedProducts);

      } catch (error) {
        console.error("Erreur lors du chargement", error);
      } finally {
        setLoadingData(false);
      }
    }

    loadData();
  }, [currentUser, authLoading, router]);

  const toggleFavorite = async (productId) => {
    if (saving) return;
    setSaving(true);
    
    let newFavorites;
    if (favorites.includes(productId)) {
      newFavorites = favorites.filter(id => id !== productId);
    } else {
      newFavorites = [...favorites, productId];
    }
    
    try {
      const userDocRef = doc(db, "users", currentUser.uid);
      await updateDoc(userDocRef, {
        favoriteNutrition: newFavorites
      });
      setFavorites(newFavorites);
    } catch (error) {
      console.error("Erreur de sauvegarde du favori", error);
      alert("Erreur lors de la sauvegarde.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);

    try {
      const newProduct = {
        name: formData.name,
        brand: formData.brand,
        type: formData.type,
        carbs: Number(formData.carbs),
        calories: Number(formData.calories),
        sodium: Number(formData.sodium),
        water: Number(formData.water) || 0,
        weight: Number(formData.weight),
        isOfficial: isAdmin ? formData.isOfficial : false,
        userId: (isAdmin && formData.isOfficial) ? null : currentUser.uid,
      };

      const productRef = editingProduct 
        ? doc(db, "nutrition_products", editingProduct.id)
        : doc(collection(db, "nutrition_products"));

      await setDoc(productRef, newProduct, { merge: true });

      const finalProduct = { id: productRef.id, ...newProduct };
      
      if (editingProduct) {
        setProducts(products.map(p => p.id === finalProduct.id ? finalProduct : p));
      } else {
        setProducts([...products, finalProduct]);
      }
      setShowModal(false);
      setEditingProduct(null);
    } catch (error) {
      console.error("Erreur de sauvegarde du produit", error);
      alert("Erreur lors de la sauvegarde.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (productId) => {
    if (!confirm("Voulez-vous vraiment supprimer ce produit ?")) return;
    try {
      await deleteDoc(doc(db, "nutrition_products", productId));
      setProducts(products.filter(p => p.id !== productId));
    } catch(err) {
      console.error("Erreur lors de la suppression", err);
      alert("Erreur lors de la suppression.");
    }
  };

  const openModalForNew = () => {
    setFormData({
      name: "",
      brand: "",
      type: "Gel",
      carbs: "",
      calories: "",
      sodium: "",
      water: "",
      weight: "",
      isOfficial: false
    });
    setEditingProduct(null);
    setShowModal(true);
  };

  const openModalForEdit = (p) => {
    setFormData({
      name: p.name,
      brand: p.brand,
      type: p.type,
      carbs: p.carbs,
      calories: p.calories,
      sodium: p.sodium,
      water: p.water || "",
      weight: p.weight,
      isOfficial: p.isOfficial
    });
    setEditingProduct(p);
    setShowModal(true);
  };

  const runMigration = async () => {
    if (!confirm("Migrer les données statiques vers Firebase ?")) return;
    try {
      for (const p of nutritionDatabase) {
        const productRef = doc(collection(db, "nutrition_products"));
        await setDoc(productRef, {
          name: p.name,
          brand: p.brand,
          type: p.type,
          carbs: p.carbs,
          calories: p.calories,
          sodium: p.sodium,
          water: p.water || 0,
          weight: p.weight,
          isOfficial: true,
          userId: null
        });
      }
      alert("Migration terminée. Rechargez la page.");
    } catch(e) {
      console.error("Erreur migration", e);
    }
  };

  const brands = ["All", ...Array.from(new Set(products.map(p => p.brand)))];
  const types = ["All", ...Array.from(new Set(products.map(p => p.type)))];

  const filteredProducts = products.filter(product => {
    const matchSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        product.brand.toLowerCase().includes(searchTerm.toLowerCase());
    const matchType = typeFilter === "All" || product.type === typeFilter;
    const matchBrand = brandFilter === "All" || product.brand === brandFilter;
    return matchSearch && matchType && matchBrand;
  });

  const getTypeIcon = (type) => {
    if (type === "Gel") return <Zap size={16} />;
    if (type === "Drink") return <Droplet size={16} />;
    if (type === "Bar") return <Cookie size={16} />;
    return null;
  };

  if (authLoading || loadingData) return <div className={styles.loader}>Chargement...</div>;

  return (
    <div className={styles.container}>
      <header className={styles.header} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Base de Données Nutrition</h1>
          <p>Explorez les produits officiels ou ajoutez vos propres produits personnels.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {isAdmin && products.length === 0 && (
            <button onClick={runMigration} style={{ padding: '8px 16px', background: 'var(--accent)', color: 'white', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>
              Migration Initiale
            </button>
          )}
          <button onClick={openModalForNew} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'white', color: 'black', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
            <Plus size={20} />
            Ajouter un produit
          </button>
        </div>
      </header>

      <div className={styles.filters}>
        <input 
          type="text" 
          placeholder="Rechercher un produit..." 
          className={styles.searchInput}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <select 
          className={styles.selectInput}
          value={brandFilter}
          onChange={(e) => setBrandFilter(e.target.value)}
        >
          {brands.map(b => <option key={b} value={b}>{b === "All" ? "Toutes les marques" : b}</option>)}
        </select>
        <select 
          className={styles.selectInput}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          {types.map(t => <option key={t} value={t}>{t === "All" ? "Tous les types" : t}</option>)}
        </select>
      </div>

      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Favori</th>
              <th>Marque</th>
              <th>Produit</th>
              <th>Type</th>
              <th>Glucides</th>
              <th>Sodium</th>
              <th>Eau</th>
              <th>Calories</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map(product => {
              const isFav = favorites.includes(product.id);
              const canEdit = product.userId === currentUser.uid || (isAdmin && product.isOfficial);

              return (
                <tr key={product.id}>
                  <td>
                    <button 
                      className={`${styles.actionBtn} ${isFav ? styles.active : ''}`}
                      onClick={() => toggleFavorite(product.id)}
                      title={isFav ? "Retirer des favoris" : "Ajouter aux favoris"}
                      disabled={saving}
                    >
                      <Star size={20} fill={isFav ? "currentColor" : "none"} />
                    </button>
                  </td>
                  <td><span className={styles.brandBadge}>{product.brand}</span></td>
                  <td>
                    <strong>{product.name}</strong>
                    {!product.isOfficial && <span style={{ marginLeft: '8px', fontSize: '0.7rem', padding: '2px 6px', background: 'var(--bg-modifier-hover)', borderRadius: '10px' }}>Personnel</span>}
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{product.weight}g</div>
                  </td>
                  <td>
                    <div className={styles.typeIcon}>
                      {getTypeIcon(product.type)}
                      {product.type}
                    </div>
                  </td>
                  <td>{product.carbs}g</td>
                  <td>{product.sodium}mg</td>
                  <td>{product.water ? `${product.water}ml` : '-'}</td>
                  <td>{product.calories} kcal</td>
                  <td>
                    {canEdit && (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => openModalForEdit(product)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                          <Edit size={16} />
                        </button>
                        <button onClick={() => handleDelete(product.id)} style={{ background: 'none', border: 'none', color: '#ff4d4f', cursor: 'pointer' }}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredProducts.length === 0 && (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Aucun produit ne correspond à votre recherche.
          </div>
        )}
      </div>

      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowModal(false)}>
          <div style={{ background: 'var(--bg-surface)', padding: '24px', borderRadius: '16px', width: '100%', maxWidth: '400px', border: '1px solid var(--border-light)' }} onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: '16px', fontSize: '1.2rem' }}>{editingProduct ? "Modifier le produit" : "Ajouter un produit"}</h2>
            
            <form onSubmit={handleSaveProduct} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input required type="text" placeholder="Marque (ex: Maurten)" style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-modifier-hover)', color: 'var(--text-primary)' }} value={formData.brand} onChange={e => setFormData({...formData, brand: e.target.value})} />
              <input required type="text" placeholder="Nom du produit" style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-modifier-hover)', color: 'var(--text-primary)' }} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
              
              <select style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-modifier-hover)', color: 'var(--text-primary)' }} value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                <option value="Gel">Gel</option>
                <option value="Drink">Drink</option>
                <option value="Bar">Bar</option>
                <option value="Autre">Autre</option>
              </select>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <input required type="number" placeholder="Poids (g)" style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-modifier-hover)', color: 'var(--text-primary)' }} value={formData.weight} onChange={e => setFormData({...formData, weight: e.target.value})} />
                <input required type="number" placeholder="Glucides (g)" style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-modifier-hover)', color: 'var(--text-primary)' }} value={formData.carbs} onChange={e => setFormData({...formData, carbs: e.target.value})} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <input required type="number" placeholder="Sodium (mg)" style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-modifier-hover)', color: 'var(--text-primary)' }} value={formData.sodium} onChange={e => setFormData({...formData, sodium: e.target.value})} />
                <input required type="number" placeholder="Calories (kcal)" style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-modifier-hover)', color: 'var(--text-primary)' }} value={formData.calories} onChange={e => setFormData({...formData, calories: e.target.value})} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <input type="number" placeholder="Eau (ml)" style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-modifier-hover)', color: 'var(--text-primary)' }} value={formData.water} onChange={e => setFormData({...formData, water: e.target.value})} />
              </div>

              {isAdmin && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', color: 'var(--text-secondary)' }}>
                  <input type="checkbox" checked={formData.isOfficial} onChange={e => setFormData({...formData, isOfficial: e.target.checked})} />
                  Produit global (Officiel)
                </label>
              )}
              
              <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid var(--border-light)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer' }}>
                  Annuler
                </button>
                <button type="submit" disabled={saving} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', background: 'white', color: 'black', cursor: 'pointer', fontWeight: 'bold' }}>
                  {saving ? 'Sauvegarde...' : 'Sauvegarder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
