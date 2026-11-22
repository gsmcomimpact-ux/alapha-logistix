import { FormEvent, useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  AlertCircle,
  CheckCircle2,
  Pencil,
  Plus,
  Shield,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  db,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import { emailToStaffId, FIELD_LIMITS, StaffRole, StaffUser } from '../types/logistics';

export function AdminStaffPanel() {
  const { user, authReady, canManageUsers } = useAuth();

  const [staffList, setStaffList] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Create form state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState('Transit & Suivi des Expéditions');
  const [role, setRole] = useState<StaffRole>('operator');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Edit state
  const [editingStaff, setEditingStaff] = useState<StaffUser | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editDepartment, setEditDepartment] = useState('');
  const [editRole, setEditRole] = useState<StaffRole>('operator');
  const [editActive, setEditActive] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!authReady || !user || !canManageUsers) return;

    setLoading(true);
    const unsubscribe = onSnapshot(
      collection(db, 'staffUsers'),
      (snapshot) => {
        const list = snapshot.docs.map((docSnap) => docSnap.data() as StaffUser);
        list.sort((a, b) => a.fullName.localeCompare(b.fullName, 'fr'));
        setStaffList(list);
        setLoading(false);
      },
      (error) => {
        setLoading(false);
        handleFirestoreError(error, OperationType.LIST, 'staffUsers');
      }
    );

    return () => unsubscribe();
  }, [authReady, user, canManageUsers]);

  const handleCreateStaff = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;
    setFormError(null);
    setFeedback(null);

    const cleanName = fullName.trim().slice(0, FIELD_LIMITS.fullNameMax);
    const cleanEmail = email.trim().toLowerCase().slice(0, FIELD_LIMITS.staffEmailMax);
    const cleanPhone = phone.trim().slice(0, FIELD_LIMITS.phoneMax);
    const cleanDepartment = department.trim().slice(0, FIELD_LIMITS.departmentMax);

    if (cleanName.length < 2) {
      setFormError('Le nom complet doit contenir au moins 2 caractères.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail) || cleanEmail.length > FIELD_LIMITS.staffEmailMax) {
      setFormError('Veuillez saisir une adresse e-mail professionnelle valide (max 120 caractères).');
      return;
    }
    if (cleanEmail === BOOTSTRAPPED_ADMIN_EMAIL) {
      setFormError('Cette adresse est déjà l’administrateur principal du système.');
      return;
    }
    if (cleanDepartment.length < 2) {
      setFormError('Veuillez indiquer le service ou département de l’utilisateur.');
      return;
    }

    const staffId = emailToStaffId(cleanEmail);
    if (staffList.some((s) => s.id === staffId)) {
      setFormError('Un utilisateur avec cette adresse e-mail existe déjà.');
      return;
    }

    setCreating(true);
    const path = `staffUsers/${staffId}`;
    try {
      await setDoc(doc(db, 'staffUsers', staffId), {
        id: staffId,
        fullName: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        department: cleanDepartment,
        role,
        active: true,
        addedBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setFullName('');
      setEmail('');
      setPhone('');
      setDepartment('Transit & Suivi des Expéditions');
      setRole('operator');
      setShowCreateForm(false);
      setFeedback(
        `Utilisateur « ${cleanName} » (${cleanEmail}) ajouté. Il peut désormais se connecter sur /administrateur.`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (staff: StaffUser) => {
    setEditingStaff(staff);
    setEditName(staff.fullName);
    setEditPhone(staff.phone);
    setEditDepartment(staff.department);
    setEditRole(staff.role);
    setEditActive(staff.active);
    setEditError(null);
    setFeedback(null);
    setShowCreateForm(false);
  };

  const handleSaveEdit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingStaff) return;
    setEditError(null);

    const cleanName = editName.trim().slice(0, FIELD_LIMITS.fullNameMax);
    const cleanPhone = editPhone.trim().slice(0, FIELD_LIMITS.phoneMax);
    const cleanDepartment = editDepartment.trim().slice(0, FIELD_LIMITS.departmentMax);

    if (cleanName.length < 2 || cleanDepartment.length < 2) {
      setEditError('Le nom complet et le service sont obligatoires.');
      return;
    }

    setSavingEdit(true);
    const path = `staffUsers/${editingStaff.id}`;
    try {
      await updateDoc(doc(db, 'staffUsers', editingStaff.id), {
        fullName: cleanName,
        phone: cleanPhone,
        department: cleanDepartment,
        role: editRole,
        active: editActive,
        updatedAt: serverTimestamp(),
      });
      setFeedback(`Accès de « ${cleanName} » mis à jour.`);
      setEditingStaff(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleToggleActive = async (staff: StaffUser) => {
    const path = `staffUsers/${staff.id}`;
    try {
      await updateDoc(doc(db, 'staffUsers', staff.id), {
        active: !staff.active,
        updatedAt: serverTimestamp(),
      });
      setFeedback(
        `Utilisateur « ${staff.fullName} » ${!staff.active ? 'activé' : 'suspendu'}.`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  const handleDeleteStaff = async (staff: StaffUser) => {
    const path = `staffUsers/${staff.id}`;
    try {
      await deleteDoc(doc(db, 'staffUsers', staff.id));
      setConfirmDeleteId(null);
      if (editingStaff?.id === staff.id) setEditingStaff(null);
      setFeedback(`Utilisateur « ${staff.fullName} » supprimé.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-lg font-bold text-slate-900">
            Utilisateurs pour la gestion des données
          </h3>
          <p className="mt-1 text-xs text-slate-600 max-w-2xl">
            Créez des comptes opérateurs ou administrateurs. Pour accéder à /administrateur, chaque
            membre du personnel se connecte avec son adresse e-mail professionnelle et son mot de
            passe (« Première connexion » pour créer son accès, puis validation de l’e-mail). Son adresse doit
            être autorisée ci-dessous.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setShowCreateForm((v) => !v);
            setEditingStaff(null);
            setFormError(null);
          }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[42px] self-start sm:self-auto"
        >
          {showCreateForm ? (
            <>
              <X className="w-4 h-4" aria-hidden="true" />
              <span>Fermer le formulaire</span>
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Créer un utilisateur</span>
            </>
          )}
        </button>
      </div>

      {feedback && (
        <div
          role="status"
          className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-900 flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
            <span>{feedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-emerald-800 underline cursor-pointer shrink-0"
          >
            Fermer
          </button>
        </div>
      )}

      {/* Create Staff User Form */}
      {showCreateForm && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
          <h4 className="font-display text-base font-bold text-slate-900">
            Ajouter un utilisateur de gestion des données
          </h4>

          <form onSubmit={handleCreateStaff} noValidate className="mt-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label htmlFor="staff-fullname" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Nom complet
                </label>
                <input
                  id="staff-fullname"
                  type="text"
                  maxLength={FIELD_LIMITS.fullNameMax}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Aïchatou Mahamadou"
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>

              <div>
                <label htmlFor="staff-email" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Adresse e-mail professionnelle autorisée
                </label>
                <input
                  id="staff-email"
                  type="email"
                  maxLength={FIELD_LIMITS.staffEmailMax}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operateur@gmail.com"
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>

              <div>
                <label htmlFor="staff-phone" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Téléphone (optionnel)
                </label>
                <input
                  id="staff-phone"
                  type="tel"
                  maxLength={FIELD_LIMITS.phoneMax}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+227 89 00 00 00"
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="staff-dept" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Service / Département
                </label>
                <input
                  id="staff-dept"
                  type="text"
                  maxLength={FIELD_LIMITS.departmentMax}
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="Transit & Suivi des Expéditions"
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>

              <div>
                <label htmlFor="staff-role" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Niveau d’autorisation
                </label>
                <select
                  id="staff-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as StaffRole)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                >
                  <option value="operator">Gestionnaire de données (Clients, Dossiers & Positions)</option>
                  <option value="admin">Administrateur complet (Données + Utilisateurs)</option>
                </select>
              </div>
            </div>

            {formError && (
              <p role="alert" className="flex items-center gap-2 text-xs font-medium text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{formError}</span>
              </p>
            )}

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer min-h-[40px]"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={creating}
                className="px-5 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-60 rounded-lg transition-colors cursor-pointer min-h-[40px]"
              >
                {creating ? 'Création...' : 'Autoriser cet utilisateur'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Staff User Panel */}
      {editingStaff && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold text-sky-700">Modification utilisateur</p>
              <h4 className="mt-1 font-display text-base font-bold text-slate-900">
                {editingStaff.fullName} · {editingStaff.email}
              </h4>
            </div>
            <button
              type="button"
              onClick={() => setEditingStaff(null)}
              aria-label="Fermer l’édition"
              className="p-2 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <form onSubmit={handleSaveEdit} noValidate className="mt-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="edit-staff-name" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Nom complet
                </label>
                <input
                  id="edit-staff-name"
                  type="text"
                  maxLength={FIELD_LIMITS.fullNameMax}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>

              <div>
                <label htmlFor="edit-staff-phone" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Téléphone
                </label>
                <input
                  id="edit-staff-phone"
                  type="tel"
                  maxLength={FIELD_LIMITS.phoneMax}
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>

              <div>
                <label htmlFor="edit-staff-dept" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Service / Département
                </label>
                <input
                  id="edit-staff-dept"
                  type="text"
                  maxLength={FIELD_LIMITS.departmentMax}
                  value={editDepartment}
                  onChange={(e) => setEditDepartment(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="edit-staff-role" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Rôle
                </label>
                <select
                  id="edit-staff-role"
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as StaffRole)}
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                >
                  <option value="operator">Gestionnaire de données (Clients, Dossiers & Positions)</option>
                  <option value="admin">Administrateur complet (Données + Utilisateurs)</option>
                </select>
              </div>

              <div>
                <label htmlFor="edit-staff-active" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Statut d’accès
                </label>
                <select
                  id="edit-staff-active"
                  value={editActive ? 'active' : 'suspended'}
                  onChange={(e) => setEditActive(e.target.value === 'active')}
                  className="w-full min-h-[42px] px-3 py-2 text-sm text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-sky-600"
                >
                  <option value="active">Actif (autorisé à gérer les données)</option>
                  <option value="suspended">Suspendu (accès bloqué)</option>
                </select>
              </div>
            </div>

            {editError && (
              <p role="alert" className="flex items-center gap-2 text-xs font-medium text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{editError}</span>
              </p>
            )}

            <div className="pt-2 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingStaff(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer min-h-[40px]"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={savingEdit}
                className="px-5 py-2 text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-60 rounded-lg transition-colors cursor-pointer min-h-[40px]"
              >
                {savingEdit ? 'Enregistrement...' : 'Mettre à jour'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Staff Users Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            <div className="h-10 bg-slate-100 rounded animate-pulse" />
            <div className="h-10 bg-slate-100 rounded animate-pulse" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Utilisateur & Service</th>
                  <th className="py-3 px-4">E-mail professionnel</th>
                  <th className="py-3 px-4">Rôle</th>
                  <th className="py-3 px-4">Statut</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {/* Primary Bootstrapped Admin */}
                <tr className="bg-slate-50/50">
                  <td className="py-3 px-4 align-top">
                    <p className="font-semibold text-slate-900 flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5 text-sky-700" aria-hidden="true" />
                      <span>Administrateur Principal</span>
                    </p>
                    <p className="text-xs text-slate-500">Direction Alpha Logistix Group</p>
                  </td>
                  <td className="py-3 px-4 align-top text-xs font-mono text-slate-700">
                    {BOOTSTRAPPED_ADMIN_EMAIL}
                  </td>
                  <td className="py-3 px-4 align-top text-xs font-medium text-slate-900">
                    Super Administrateur
                  </td>
                  <td className="py-3 px-4 align-top text-xs font-semibold text-emerald-700">
                    Actif (système)
                  </td>
                  <td className="py-3 px-4 align-top text-right text-xs text-slate-400">
                    Compte protégé
                  </td>
                </tr>

                {staffList.map((staff) => {
                  const isSelf = (user?.email || '').toLowerCase() === staff.email.toLowerCase();
                  return (
                    <tr key={staff.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 align-top">
                        <p className="font-semibold text-slate-900">{staff.fullName}</p>
                        <p className="text-xs text-slate-500">
                          {staff.department}
                          {staff.phone ? ` · ${staff.phone}` : ''}
                        </p>
                      </td>
                      <td className="py-3 px-4 align-top text-xs font-mono text-slate-700">
                        {staff.email}
                      </td>
                      <td className="py-3 px-4 align-top text-xs font-medium text-slate-800">
                        {staff.role === 'admin' ? 'Administrateur' : 'Gestionnaire données'}
                      </td>
                      <td className="py-3 px-4 align-top">
                        <span
                          className={`text-xs font-semibold ${
                            staff.active ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {staff.active ? 'Actif' : 'Suspendu'}
                        </span>
                      </td>
                      <td className="py-3 px-4 align-top text-right">
                        <div className="inline-flex items-center justify-end gap-2">
                          {!isSelf && (
                            <button
                              type="button"
                              onClick={() => void handleToggleActive(staff)}
                              className="px-2.5 py-1.5 text-xs font-medium text-orange-700 hover:text-orange-800 bg-white border border-orange-200 hover:bg-orange-50 rounded-md cursor-pointer whitespace-nowrap"
                            >
                              {staff.active ? 'Suspendre' : 'Activer'}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => openEdit(staff)}
                            aria-label={`Modifier ${staff.fullName}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-orange-700 hover:text-orange-800 bg-orange-50 hover:bg-orange-100 rounded-md cursor-pointer whitespace-nowrap"
                          >
                            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Modifier</span>
                          </button>

                          {!isSelf && (
                            confirmDeleteId === staff.id ? (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteStaff(staff)}
                                  className="px-2.5 py-1.5 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 rounded-md cursor-pointer"
                                >
                                  Confirmer
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-2 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                                >
                                  Annuler
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(staff.id)}
                                aria-label={`Supprimer ${staff.fullName}`}
                                className="p-1.5 text-slate-400 hover:text-red-700 rounded-md transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" aria-hidden="true" />
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
