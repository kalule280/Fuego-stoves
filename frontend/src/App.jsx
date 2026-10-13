import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './App.css';
import fuegoWallImg from './images/fuego stove image.jpg';

// Setup Axios Interceptor to include JWT token in all requests
axios.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('fuego-token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => Promise.reject(error));

// Auto-logout on 401 (expired or invalid token)
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && sessionStorage.getItem('fuego-token')) {
      sessionStorage.removeItem('fuego-token');
      sessionStorage.removeItem('fuego-user');
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

const FuegoLogo = ({ scale = 1 }) => (
  <img
    src="/fuego-logo.svg?v=3"
    alt="Fuego Uganda Limited"
    className="fuego-logo h-12 w-auto max-w-full shrink-0 object-contain"
    style={{ transform: `scale(${scale})`, transformOrigin: 'left center' }}
  />
);

const Login = ({ onLogin, error }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div className="flex h-screen w-full items-center justify-center bg-slate-50">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <FuegoLogo scale={0.8} />
        </div>
        <h2 className="text-2xl font-bold text-center text-slate-800 mb-6">Login</h2>
        {error && <div className="mb-4 text-red-600 bg-red-50 p-3 rounded-lg text-sm text-center">{error}</div>}
        <form onSubmit={(e) => { e.preventDefault(); onLogin(username, password); }} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
            <input 
              type="text" 
              value={username} 
              onChange={e => setUsername(e.target.value)} 
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none text-slate-900"
              required 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input 
              type="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-600 outline-none text-slate-900"
              required 
            />
          </div>
          <button type="submit" className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors mt-2">
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
};

function App() {
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard', 'inventory', or 'transaction'
  const [inventory, setInventory] = useState([]);
  const [selectedStove, setSelectedStove] = useState(null);
  const [deletingStockRecord, setDeletingStockRecord] = useState(false);
  const [loading, setLoading] = useState(true);
  const [branchId, setBranchId] = useState(1);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [message, setMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Auth State
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!sessionStorage.getItem('fuego-token'));
  const [user, setUser] = useState(() => {
    const savedUser = sessionStorage.getItem('fuego-user');
    return savedUser ? JSON.parse(savedUser) : null;
  });
  const [loginError, setLoginError] = useState('');

  const handleLogin = async (username, password) => {
    setLoginError('');
    try {
      const res = await axios.post('http://localhost:5000/api/auth/login', { username, password });
      sessionStorage.setItem('fuego-token', res.data.token);
      sessionStorage.setItem('fuego-user', JSON.stringify(res.data.user));
      setIsAuthenticated(true);
      setUser(res.data.user);
    } catch (err) {
      setLoginError(err.response?.data?.error || 'Login failed');
    }
  };

  const handleUserPhotoUpload = async (userId, file) => {
    if (!file) return;
    const formData = new FormData();
    formData.append('photo', file);
    setPhotoUploadingId(userId);
    setErrorMsg('');
    setMessage('');
    try {
      const res = await axios.post(`http://localhost:5000/api/users/${userId}/photo`, formData);
      setUsers((current) => current.map((listedUser) => (
        listedUser.id === userId
          ? { ...listedUser, profile_photo_url: res.data.profile_photo_url }
          : listedUser
      )));
      if (Number(user?.id) === Number(userId)) {
        const updatedUser = { ...user, profile_photo_url: res.data.profile_photo_url };
        setUser(updatedUser);
        sessionStorage.setItem('fuego-user', JSON.stringify(updatedUser));
      }
      setMessage('Profile photo updated successfully.');
    } catch (error) {
      console.error('Error uploading user photo:', error);
      setErrorMsg(error.response?.data?.error || 'Failed to upload profile photo.');
    } finally {
      setPhotoUploadingId(null);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('fuego-token');
    sessionStorage.removeItem('fuego-user');
    setIsAuthenticated(false);
    setUser(null);
  };

  // Transaction form states
  const [txStoveId, setTxStoveId] = useState('');
  const [txType, setTxType] = useState('sale');
  const [txQty, setTxQty] = useState(1);
  const [txPrice, setTxPrice] = useState('');
  const [txNotes, setTxNotes] = useState('');
  const [txStaffName, setTxStaffName] = useState('');
  const [recentTransactions, setRecentTransactions] = useState([]);

  // Add Product State
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Quotations & Receipts states
  const [qRecords, setQRecords] = useState([]);
  const [qView, setQView] = useState("list"); // list | editor | preview
  const [qDocType, setQDocType] = useState("quotation"); // quotation | receipt
  const [qEditing, setQEditing] = useState(null);

  const [qCustomer, setQCustomer] = useState("");
  const [qPhone, setQPhone] = useState("");
  const [qAddress, setQAddress] = useState("");
  const [qItems, setQItems] = useState([]);
  const [qNotes, setQNotes] = useState("Valid for 14 days from date of issue.");
  const [qAmountPaid, setQAmountPaid] = useState("");

  const createEmptyQItem = () => ({
    key: Math.random().toString(36).slice(2, 10),
    item: "",
    qty: 1,
    price: 0
  });

  const getItemTotal = (items = []) => items.reduce((sum, it) => sum + (Number(it.qty || 0) * Number(it.price || 0)), 0);

  const getReceiptStatus = (amountPaid, totalAmt) => {
    const paid = Number(amountPaid || 0);
    if (totalAmt <= 0) return 'Unpaid';
    if (paid >= totalAmt) return 'Paid';
    if (paid > 0) return 'Partially Paid';
    return 'Unpaid';
  };

  const updateQItem = (key, patch) => {
    setQItems((prev) =>
      prev.map((it) => {
        if (it.key !== key) return it;
        const next = { ...it, ...patch };
        if (patch.item !== undefined) {
          const prod = inventory.find((p) => p.name === patch.item);
          if (prod) {
            next.price = prod.price;
          }
        }
        return next;
      })
    );
  };

  // Dark mode state — persisted in localStorage
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('fuego-dark-mode');
    return saved !== null ? JSON.parse(saved) : false;
  });

  // Accounting / Expenses states
  const [expenses, setExpenses] = useState([]);
  const [expCategory, setExpCategory] = useState('transport');
  const [expDescription, setExpDescription] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const EXPENSE_CATEGORIES = ['rent', 'transport', 'salaries', 'utilities', 'stock purchase', 'other'];
  const [purchases, setPurchases] = useState([]);
  const [purchasesLoading, setPurchasesLoading] = useState(false);
  const [performance, setPerformance] = useState(null);
  const [performanceLoading, setPerformanceLoading] = useState(false);
  const [purchaseMonth, setPurchaseMonth] = useState(date.slice(0, 7));
  const [purchaseForm, setPurchaseForm] = useState({
    item_name: '',
    category: 'material',
    quantity: '',
    unit_cost: '',
    supplier: '',
    notes: '',
    purchase_date: date
  });
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [photoUploadingId, setPhotoUploadingId] = useState(null);
  const [loginHistory, setLoginHistory] = useState({});
  const [loginHistoryLoading, setLoginHistoryLoading] = useState(null);
  const [expandedLoginHistory, setExpandedLoginHistory] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [userEditForm, setUserEditForm] = useState(null);
  const [savingUser, setSavingUser] = useState(false);
  const [changingUserStatus, setChangingUserStatus] = useState(null);
  const [deletingUser, setDeletingUser] = useState(null);
  const [form, setForm] = useState({
    name: '',
    username: '',
    password: '',
    role: 'staff',
    branch_id: 1
  });

  // Apply dark class to <html> whenever darkMode changes
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark-bg');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark-bg');
    }
    localStorage.setItem('fuego-dark-mode', JSON.stringify(darkMode));
  }, [darkMode]);

  // Load stoves catalog and opening stock
  const loadData = () => {
    setLoading(true);
    Promise.all([
      axios.get(`http://localhost:5000/api/inventory/opening-stock?branch_id=${branchId}&date=${date}`),
      axios.get(`http://localhost:5000/api/transactions?branch_id=${branchId}&date=${date}`)
    ])
      .then(([invRes, txRes]) => {
        setInventory(invRes.data);
        if (invRes.data.length > 0) {
          setSelectedStove(currentSelected => {
            if (currentSelected) {
              const refreshed = invRes.data.find(s => s.stove_id === currentSelected.stove_id);
              return refreshed || currentSelected;
            }
            return invRes.data[0];
          });
        }
        
        const history = txRes.data.map(t => ({
          id: t.id,
          name: t.stoveName,
          stove_id: t.stove_id,
          type: t.type.charAt(0).toUpperCase() + t.type.slice(1),
          qty: t.qty,
          price: t.price ? `${Number(t.price).toLocaleString()} UGX` : '0 UGX',
          date: new Date(t.record_date).toLocaleDateString('en-GB', {day: '2-digit', month: 'short', year: 'numeric'}),
          time: new Date(t.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
          color: t.type === 'damaged' ? 'error' : 'secondary',
          icon: t.type === 'damaged' ? 'broken_image' : 'shopping_cart',
          status: t.status || 'pending',
          raw_price: t.price,
          staff_name: t.staff_name || '',
          created_by_name: t.created_by_name || 'System'
        }));
        setRecentTransactions(history);
        
        setLoading(false);
      })
      .catch(error => {
        console.error('Error fetching data:', error);
        setErrorMsg('Failed to fetch data.');
        setLoading(false);
      });
  };

  const loadQuotations = () => {
    axios.get(`http://localhost:5000/api/quotations?branch_id=${branchId}`)
      .then(res => {
        setQRecords(res.data);
      })
      .catch(err => console.error("Error loading quotations:", err));
  };

  const loadExpenses = () => {
    axios.get(`http://localhost:5000/api/expenses?branch_id=${branchId}&date=${date}`)
      .then(res => setExpenses(res.data))
      .catch(err => console.error("Error loading expenses:", err));
  };

  const loadPurchases = useCallback(async () => {
    setPurchasesLoading(true);
    try {
      const res = await axios.get(
        `http://localhost:5000/api/purchases?branch_id=${Number(branchId)}&month=${purchaseMonth}`
      );
      setPurchases(res.data);
    } catch (error) {
      console.error('Error loading purchases:', error);
      setErrorMsg(error.response?.data?.error || 'Failed to load purchases.');
    } finally {
      setPurchasesLoading(false);
    }
  }, [branchId, purchaseMonth]);

  const loadPerformance = useCallback(async () => {
    setPerformanceLoading(true);
    try {
      const res = await axios.get(
        `http://localhost:5000/api/performance?branch_id=${Number(branchId)}`
      );
      setPerformance(res.data);
    } catch (error) {
      console.error('Error loading monthly performance:', error);
      setErrorMsg(error.response?.data?.error || 'Failed to load monthly performance.');
    } finally {
      setPerformanceLoading(false);
    }
  }, [branchId]);

  const handleRecordPurchase = async (event) => {
    event.preventDefault();
    setMessage('');
    setErrorMsg('');
    try {
      await axios.post('http://localhost:5000/api/purchases', {
        ...purchaseForm,
        branch_id: Number(branchId),
        quantity: Number(purchaseForm.quantity),
        unit_cost: Number(purchaseForm.unit_cost)
      });
      setMessage('Purchase recorded successfully.');
      setPurchaseForm({
        item_name: '',
        category: 'material',
        quantity: '',
        unit_cost: '',
        supplier: '',
        notes: '',
        purchase_date: purchaseForm.purchase_date
      });
      setPurchaseMonth(purchaseForm.purchase_date.slice(0, 7));
      await loadPurchases();
    } catch (error) {
      console.error('Error recording purchase:', error);
      setErrorMsg(error.response?.data?.error || 'Failed to record purchase.');
    }
  };

  const handleVoidPurchase = async (purchase) => {
    if (!window.confirm(`Void purchase #${purchase.id} for ${purchase.item_name}? It will remain in the history as voided.`)) {
      return;
    }
    setMessage('');
    setErrorMsg('');
    try {
      await axios.put(`http://localhost:5000/api/purchases/${purchase.id}/void`);
      setMessage('Purchase voided. The record remains in the history.');
      await loadPurchases();
    } catch (error) {
      console.error('Error voiding purchase:', error);
      setErrorMsg(error.response?.data?.error || 'Failed to void purchase.');
    }
  };

  const loadUsers = async () => {
    setUsersLoading(true);
    try {
      const res = await axios.get('http://localhost:5000/api/users');
      setUsers(res.data);
    } catch (error) {
      console.error('Error loading users:', error);
      setErrorMsg(error.response?.data?.error || 'Failed to load users.');
    } finally {
      setUsersLoading(false);
    }
  };

  const openEditUser = (listedUser) => {
    setEditingUser(listedUser);
    setUserEditForm({
      name: listedUser.name || '',
      username: listedUser.username || '',
      role: listedUser.role,
      branch_id: Number(listedUser.branch_id) || 1,
      password: ''
    });
    setErrorMsg('');
    setMessage('');
  };

  const handleUpdateUser = async (event) => {
    event.preventDefault();
    setSavingUser(true);
    setErrorMsg('');
    setMessage('');
    try {
      const { password, ...userFields } = userEditForm;
      await axios.put(`http://localhost:5000/api/users/${editingUser.id}`, {
        ...userFields,
        ...(password ? { password } : {})
      });
      if (Number(user?.id) === Number(editingUser.id)) {
        const updatedUser = { ...user, ...userFields };
        setUser(updatedUser);
        sessionStorage.setItem('fuego-user', JSON.stringify(updatedUser));
      }
      setMessage(`Updated ${userEditForm.name}'s account.`);
      setEditingUser(null);
      setUserEditForm(null);
      await loadUsers();
    } catch (error) {
      console.error('Error updating user:', error);
      setErrorMsg(error.response?.data?.error || 'Failed to update user.');
    } finally {
      setSavingUser(false);
    }
  };

  const handleToggleUserStatus = async (listedUser) => {
    const nextActive = !listedUser.active;
    const action = nextActive ? 'unlock' : 'lock';
    if (!window.confirm(`${action === 'lock' ? 'Lock' : 'Unlock'} ${listedUser.name}'s account?${nextActive ? '' : ' They will be signed out of protected actions immediately.'}`)) {
      return;
    }
    setChangingUserStatus(listedUser.id);
    setErrorMsg('');
    setMessage('');
    try {
      await axios.put(`http://localhost:5000/api/users/${listedUser.id}`, { active: nextActive });
      setMessage(`${listedUser.name}'s account is now ${nextActive ? 'active' : 'locked'}.`);
      await loadUsers();
    } catch (error) {
      console.error('Error changing user account status:', error);
      setErrorMsg(error.response?.data?.error || 'Failed to change account status.');
    } finally {
      setChangingUserStatus(null);
    }
  };

  const handleDeleteUser = async (listedUser) => {
    if (!window.confirm(`Permanently delete ${listedUser.name} (${listedUser.username})? Existing accounting and transaction records will be retained.`)) {
      return;
    }
    setDeletingUser(listedUser.id);
    setErrorMsg('');
    setMessage('');
    try {
      await axios.delete(`http://localhost:5000/api/users/${listedUser.id}`);
      setUsers((current) => current.filter((item) => item.id !== listedUser.id));
      setLoginHistory((current) => {
        const updated = { ...current };
        delete updated[listedUser.id];
        return updated;
      });
      setMessage(`${listedUser.name}'s account was deleted.`);
    } catch (error) {
      console.error('Error deleting user:', error);
      setErrorMsg(error.response?.data?.error || 'Failed to delete user.');
    } finally {
      setDeletingUser(null);
    }
  };

  const loadUserLoginHistory = async (userId) => {
    setLoginHistoryLoading(userId);
    setErrorMsg('');
    try {
      const res = await axios.get(`http://localhost:5000/api/users/${userId}/login-history`);
      setLoginHistory((current) => ({ ...current, [userId]: res.data }));
    } catch (error) {
      console.error('Error loading user login history:', error);
      setErrorMsg(error.response?.data?.error || 'Failed to load login history.');
    } finally {
      setLoginHistoryLoading(null);
    }
  };

  const toggleLoginHistory = async (userId) => {
    if (expandedLoginHistory === userId) {
      setExpandedLoginHistory(null);
      return;
    }
    setExpandedLoginHistory(userId);
    await loadUserLoginHistory(userId);
  };

  const handleCreateUser = async (event) => {
    event.preventDefault();
    setMessage('');
    setErrorMsg('');
    try {
      await axios.post('http://localhost:5000/api/users', form);
      setMessage('User created successfully.');
      setForm({ name: '', username: '', password: '', role: 'staff', branch_id: 1 });
      await loadUsers();
    } catch (error) {
      console.error('Error creating user:', error);
      setErrorMsg(error.response?.data?.error || 'Failed to create user.');
    }
  };

  useEffect(() => {
    if (activeTab === 'users' && user?.role === 'admin') {
      loadUsers();
    }
  }, [activeTab, user]);

  useEffect(() => {
    if (activeTab === 'accounting' && user?.role === 'admin') {
      loadPurchases();
      loadPerformance();
    }
  }, [activeTab, user, loadPurchases, loadPerformance]);

  useEffect(() => {
    loadData();
    loadQuotations();
    loadExpenses();

    // Auto-poll every 5 seconds so admin actions (confirm/delete) sync to staff in real-time
    const pollInterval = setInterval(() => {
      loadData();
      loadQuotations();
      loadExpenses();
    }, 5000);
    return () => clearInterval(pollInterval);
  }, [branchId, date]);

  const handleImageUpload = async (stoveId, file) => {
    if (!file) return;
    const formData = new FormData();
    formData.append('image', file);
    try {
      setLoading(true);
      const res = await axios.post(`http://localhost:5000/api/stoves/${stoveId}/image`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      if (res.data.success) {
        setMessage(res.data.message);
        loadData(); // Refresh to get the new image
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (err) {
      console.error('Upload failed', err);
      setErrorMsg('Failed to upload image');
      setLoading(false);
    }
  };

  const handleStoveUpdate = async (stoveId, newName, newPrice) => {
    const numericPrice = Number(newPrice);
    if (typeof newName !== 'string' || !newName.trim()
      || !Number.isFinite(numericPrice) || numericPrice < 0 || numericPrice > 99999999.99) {
      setErrorMsg('Enter a stove name and a valid non-negative price.');
      return;
    }
    try {
      setErrorMsg('');
      const res = await axios.put(`http://localhost:5000/api/stoves/${stoveId}`, {
        name: newName.trim(),
        price: numericPrice
      });
      if (res.data.success) {
        setMessage(res.data.message);
        loadData();
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (err) {
      console.error('Update failed', err);
      setErrorMsg(err.response?.data?.error || 'Failed to update stove details');
      setTimeout(() => setErrorMsg(''), 3000);
    }
  };

  // Handle inline stock changes in directory list
  const handleStockChange = (stoveId, field, value) => {
    setInventory(prev => prev.map(item => {
      if (item.stove_id === stoveId) {
        const numVal = Number(value) || 0;
        const updated = { ...item, [field]: numVal };
        // If user manually edits closing_stock, use their value directly
        if (field !== 'closing_stock') {
          updated.closing_stock = (Number(updated.opening_stock) || 0) + 
                                  (Number(updated.received_stock) || 0) + 
                                  (Number(updated.returned_stock) || 0) - 
                                  (Number(updated.sold_stock) || 0) - 
                                  (Number(updated.damaged_stock) || 0) - 
                                  (Number(updated.removed_stock) || 0);
        }
        if (selectedStove && selectedStove.stove_id === stoveId) {
          setSelectedStove(updated);
        }
        return updated;
      }
      return item;
    }));
  };

  // Submit all inventory data to backend
  const handleSaveInventory = async () => {
    try {
      setMessage('');
      setErrorMsg('');
      const payload = {
        branch_id: Number(branchId),
        date: date,
        items: inventory.map(item => ({
          stove_id: item.stove_id,
          opening_stock: Number(item.opening_stock) || 0,
          received_stock: Number(item.received_stock) || 0,
          closing_stock: Number(item.closing_stock) || 0
        }))
      };

      const res = await axios.post('http://localhost:5000/api/inventory', payload);
      setMessage(res.data.message || 'Inventory saved successfully!');
      loadData();
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to save inventory.');
    }
  };

  const handleDeleteStockRecord = async (stove) => {
    const branchLabel = Number(branchId) === 1 ? 'Branch 1 (Kira)' : `Branch ${branchId}`;
    const confirmed = window.confirm(
      `Delete ${stove.name}'s stock record for ${branchLabel} on ${date}? The stove model and records for other dates will remain.`
    );
    if (!confirmed) return;

    setDeletingStockRecord(true);
    setMessage('');
    setErrorMsg('');
    try {
      const response = await axios.delete(
        `http://localhost:5000/api/inventory/${Number(branchId)}/${date}/${stove.stove_id}`
      );
      setMessage(response.data.message || 'Stock record deleted successfully.');
      loadData();
    } catch (error) {
      console.error('Error deleting stock record:', error);
      setErrorMsg(error.response?.data?.error || 'Failed to delete stock record.');
    } finally {
      setDeletingStockRecord(false);
    }
  };

  const handleRecordTransaction = async () => {
    const matchedStove = inventory.find(s => s.stove_id === Number(txStoveId));
    if (!matchedStove) {
      setErrorMsg('Please select a valid stove model.');
      return;
    }
    
    try {
      setMessage('');
      setErrorMsg('');
      const txId = `TRX-${Math.floor(1000 + Math.random() * 9000)}`;
      const payload = {
        transaction_id: txId,
        branch_id: Number(branchId),
        date: date,
        stove_id: Number(txStoveId),
        type: txType,
        qty: Number(txQty),
        price: Number(txPrice) || 0,
        notes: txNotes || "",
        staff_name: txStaffName || ""
      };

      const res = await axios.post('http://localhost:5000/api/transaction', payload);
      setMessage(res.data.message || 'Transaction recorded and inventory updated!');
      
      const newTrx = {
        id: txId,
        name: matchedStove.name,
        stove_id: Number(txStoveId),
        type: txType.charAt(0).toUpperCase() + txType.slice(1),
        qty: Number(txQty),
        price: txPrice ? `${Number(txPrice).toLocaleString()} UGX` : '0 UGX',
        time: 'Just now',
        color: txType === 'damaged' ? 'error' : 'secondary',
        icon: txType === 'damaged' ? 'broken_image' : 'shopping_cart',
        status: 'pending',
        staff_name: txStaffName || '',
        created_by_name: user?.name || 'Staff Member'
      };
      setRecentTransactions([newTrx, ...recentTransactions]);
      
      // Reset form fields
      setTxStoveId('');
      setTxQty(1);
      setTxPrice('');
      setTxNotes('');
      setTxStaffName('');
      setMobileMenuOpen(false); // Close mobile menu after recording tx
      
      // Reload updated inventory numbers from backend
      loadData();
    } catch (err) {
      console.error(err);
      const backendError = err.response?.data?.details || err.response?.data?.error || err.message;
      setErrorMsg(`Failed to record transaction. ${backendError}`);
    }
  };

  const handleCancelTransaction = async (trx) => {
    if (!window.confirm(`Are you sure you want to cancel the ${trx.type} of ${trx.qty} ${trx.name}(s)?`)) return;
    
    try {
      setMessage('');
      setErrorMsg('');
      const payload = {
        transaction_id: trx.id,
        branch_id: Number(branchId),
        date: date,
        stove_id: trx.stove_id,
        type: trx.type.toLowerCase(),
        qty: trx.qty,
        is_cancel: true
      };

      const res = await axios.post('http://localhost:5000/api/transaction', payload);
      setRecentTransactions(prev => prev.filter(t => t.id !== trx.id));
      loadData(); // refresh to recalculate closing stock
      setMessage('Transaction canceled successfully.');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error(err);
      setErrorMsg('Failed to cancel transaction.');
      setTimeout(() => setErrorMsg(''), 3000);
    }
  };

  const handleConfirmTransaction = async (trx) => {
    try {
      await axios.put(`http://localhost:5000/api/transactions/${trx.id}/confirm`);
      
      setRecentTransactions(prev => prev.map(t => t.id === trx.id ? { ...t, status: 'confirmed' } : t));
      loadExpenses(); // Reload accounting tab to show new income
      
      setMessage('Transaction confirmed and added to Accounting.');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error(err);
      setErrorMsg(err.response?.data?.error || 'Failed to confirm transaction.');
      setTimeout(() => setErrorMsg(''), 3000);
    }
  };

  // Compute stats for the dashboard overview
  const totalOpeningStock = inventory.reduce((sum, item) => sum + (Number(item.opening_stock) || 0), 0);
  const totalCurrentStock = inventory.reduce((sum, item) => sum + (Number(item.closing_stock) || Number(item.opening_stock) || 0), 0);
  const totalSalesToday = recentTransactions.filter(t => t.type === 'Sale').reduce((sum, t) => sum + t.qty, 0);
  const totalDamagedToday = recentTransactions.filter(t => t.type === 'Damaged').reduce((sum, t) => sum + t.qty, 0);
  const totalRevenueToday = recentTransactions.filter(t => t.type === 'Sale').reduce((sum, t) => sum + Number(t.raw_price || 0), 0);
  const totalExpenseToday = expenses.filter(e => e.type !== 'income').reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const totalProfitToday = totalRevenueToday - totalExpenseToday;

  const escapeCsvValue = (value) => {
    const stringValue = String(value ?? '');
    return `"${stringValue.replace(/"/g, '""')}"`;
  };

  const createCsvReport = (filename, rows) => {
    if (!rows || rows.length === 0) {
      return;
    }

    const headers = Object.keys(rows[0]);
    const csvContent = [
      headers.join(','),
      ...rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportDailyTransactionReport = () => {
    const rows = recentTransactions.map((item) => ({
      Date: item.date || date,
      Type: item.type,
      Stove: item.name,
      Qty: Number(item.qty || 0),
      UnitPriceUGX: Number(item.raw_price || 0) / Math.max(Number(item.qty || 1), 1),
      TotalValueUGX: Number(item.raw_price || 0),
      Staff: item.staff_name || item.created_by_name || 'System',
      Status: item.status || 'pending',
      Notes: item.notes || ''
    }));

    createCsvReport(`kira-daily-report-${date}.csv`, rows);
  };

  const exportWeeklySalesReport = () => {
    const summary = new Map();

    recentTransactions
      .filter((item) => item.type === 'Sale' && item.date)
      .forEach((item) => {
        const parsedDate = new Date(item.date);
        const label = parsedDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
        const current = summary.get(label) || { Period: label, UnitsSold: 0, RevenueUGX: 0, Transactions: 0 };
        current.UnitsSold += Number(item.qty || 0);
        current.RevenueUGX += Number(item.raw_price || 0);
        current.Transactions += 1;
        summary.set(label, current);
      });

    const rows = [...summary.values()];
    createCsvReport(`kira-weekly-sales-${date}.csv`, rows.length ? rows : [{ Period: 'No sales data', UnitsSold: 0, RevenueUGX: 0, Transactions: 0 }]);
  };

  const exportMonthlySalesReport = () => {
    const summary = new Map();

    recentTransactions
      .filter((item) => item.type === 'Sale' && item.date)
      .forEach((item) => {
        const parsedDate = new Date(item.date);
        const label = parsedDate.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
        const current = summary.get(label) || { Period: label, UnitsSold: 0, RevenueUGX: 0, Transactions: 0 };
        current.UnitsSold += Number(item.qty || 0);
        current.RevenueUGX += Number(item.raw_price || 0);
        current.Transactions += 1;
        summary.set(label, current);
      });

    const rows = [...summary.values()];
    createCsvReport(`kira-monthly-sales-${date}.csv`, rows.length ? rows : [{ Period: 'No sales data', UnitsSold: 0, RevenueUGX: 0, Transactions: 0 }]);
  };

  const salesWeekData = [
    { label: 'Mon', value: Math.max(1, Math.round((totalRevenueToday || 120000) / 8 * 0.75)) },
    { label: 'Tue', value: Math.max(1, Math.round((totalRevenueToday || 120000) / 8 * 0.96)) },
    { label: 'Wed', value: Math.max(1, Math.round((totalRevenueToday || 120000) / 8 * 1.18)) },
    { label: 'Thu', value: Math.max(1, Math.round((totalRevenueToday || 120000) / 8 * 1.02)) },
    { label: 'Fri', value: Math.max(1, Math.round((totalRevenueToday || 120000) / 8 * 1.35)) },
    { label: 'Sat', value: Math.max(1, Math.round((totalRevenueToday || 120000) / 8 * 1.44)) },
    { label: 'Sun', value: Math.max(1, Math.round((totalRevenueToday || 120000) / 8 * 1.10)) },
  ];

  const salesMonthData = [
    { label: 'Jan', value: Math.max(1, Math.round((totalRevenueToday || 150000) * 0.9)) },
    { label: 'Feb', value: Math.max(1, Math.round((totalRevenueToday || 150000) * 1.12)) },
    { label: 'Mar', value: Math.max(1, Math.round((totalRevenueToday || 150000) * 1.18)) },
    { label: 'Apr', value: Math.max(1, Math.round((totalRevenueToday || 150000) * 1.25)) },
    { label: 'May', value: Math.max(1, Math.round((totalRevenueToday || 150000) * 1.38)) },
    { label: 'Jun', value: Math.max(1, Math.round((totalRevenueToday || 150000) * 1.48)) },
  ];

  const pieSegments = [
    { label: 'Sales', value: Math.max(totalRevenueToday, 1), color: '#2E7D32' },
    { label: 'Expenses', value: Math.max(totalExpenseToday, 1), color: '#EF4444' },
    { label: 'Profit', value: Math.max(totalProfitToday, 1), color: '#F59E0B' },
  ];

  const pieTotal = pieSegments.reduce((sum, item) => sum + item.value, 0) || 1;
  const pieGradient = (() => {
    let start = 0;
    return `conic-gradient(${pieSegments.map((segment) => {
      const end = start + (segment.value / pieTotal) * 100;
      const result = `${segment.color} ${start}% ${end}%`;
      start = end;
      return result;
    }).join(', ')})`;
  })();

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} error={loginError} />;
  }

  return (
    <div className="font-body-md text-body-md antialiased min-h-screen flex bg-background">
      {mobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-[70] backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <nav className={`flex flex-col py-lg bg-surface text-on-surface-variant h-full w-80 rounded-r-xl border-r border-outline-variant shadow-md fixed inset-y-0 left-0 z-[80] transition-transform duration-300 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <div className="px-lg pb-lg border-b border-outline-variant mb-4 flex items-center gap-4">
          <div className="flex-shrink-0 pt-2">
            <FuegoLogo scale={0.7} />
          </div>
          <div>
            <h2 className="font-headline-md text-headline-md font-bold text-secondary">Fuego Uganda Limited</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">Main Depot - Area 4</p>
            <p className="font-label-sm text-label-sm text-outline mt-1">v2.1.0</p>
          </div>
          <button
            aria-label="Close navigation menu"
            className="md:hidden ml-auto text-on-surface-variant hover:text-on-surface p-1"
            onClick={() => setMobileMenuOpen(false)}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <ul className="flex flex-col gap-2 flex-grow overflow-y-auto no-scrollbar">
          <li>
            <button
              onClick={() => { setActiveTab('dashboard'); setMobileMenuOpen(false); }}
              className={`w-[95%] text-left rounded-full mx-2 px-4 py-3 flex items-center gap-4 transition-all ${activeTab === 'dashboard' ? 'bg-secondary-container text-on-secondary-container font-bold' : 'text-on-surface-variant hover:bg-surface-container-high'}`}
            >
              <span className="material-symbols-outlined" style={{ fontVariationSettings: `'FILL' ${activeTab === 'dashboard' ? 1 : 0}` }}>analytics</span>
              Overview
            </button>
          </li>
          <li>
            <button
              onClick={() => { setActiveTab('inventory'); setMobileMenuOpen(false); }}
              className={`w-[95%] text-left rounded-full mx-2 px-4 py-3 flex items-center gap-4 transition-all ${activeTab === 'inventory' ? 'bg-secondary-container text-on-secondary-container font-bold' : 'text-on-surface-variant hover:bg-surface-container-high'}`}
            >
              <span className="material-symbols-outlined" style={{ fontVariationSettings: `'FILL' ${activeTab === 'inventory' ? 1 : 0}` }}>inventory_2</span>
              Stock Manager
            </button>
          </li>
          <li>
            <button
              onClick={() => { setActiveTab('transaction'); setMobileMenuOpen(false); }}
              className={`w-[95%] text-left rounded-full mx-2 px-4 py-3 flex items-center gap-4 transition-all ${activeTab === 'transaction' ? 'bg-secondary-container text-on-secondary-container font-bold' : 'text-on-surface-variant hover:bg-surface-container-high'}`}
            >
              <span className="material-symbols-outlined" style={{ fontVariationSettings: `'FILL' ${activeTab === 'transaction' ? 1 : 0}` }}>sell</span>
              Sales Records
            </button>
          </li>
          <li>
            <button
              onClick={() => { setActiveTab('quotations'); setMobileMenuOpen(false); setQView('list'); }}
              className={`w-[95%] text-left rounded-full mx-2 px-4 py-3 flex items-center gap-4 transition-all ${activeTab === 'quotations' ? 'bg-secondary-container text-on-secondary-container font-bold' : 'text-on-surface-variant hover:bg-surface-container-high'}`}
            >
              <span className="material-symbols-outlined" style={{ fontVariationSettings: `'FILL' ${activeTab === 'quotations' ? 1 : 0}` }}>description</span>
              Quotations &amp; Receipts
            </button>
          </li>
          <li>
            <button
              onClick={() => { setActiveTab('accounting'); setMobileMenuOpen(false); }}
              className={`w-[95%] text-left rounded-full mx-2 px-4 py-3 flex items-center gap-4 transition-all ${activeTab === 'accounting' ? 'bg-secondary-container text-on-secondary-container font-bold' : 'text-on-surface-variant hover:bg-surface-container-high'}`}
            >
              <span className="material-symbols-outlined" style={{ fontVariationSettings: `'FILL' ${activeTab === 'accounting' ? 1 : 0}` }}>account_balance</span>
              Accounting
            </button>
          </li>
          <li>
            <button
              onClick={() => { setActiveTab('analytics'); setMobileMenuOpen(false); }}
              className={`w-[95%] text-left rounded-full mx-2 px-4 py-3 flex items-center gap-4 transition-all ${activeTab === 'analytics' ? 'bg-secondary-container text-on-secondary-container font-bold' : 'text-on-surface-variant hover:bg-surface-container-high'}`}
            >
              <span className="material-symbols-outlined" style={{ fontVariationSettings: `'FILL' ${activeTab === 'analytics' ? 1 : 0}` }}>bar_chart</span>
              Analytics
            </button>
          </li>
          {user?.role === 'admin' && (
            <li>
              <button
                onClick={() => { setActiveTab('users'); setMobileMenuOpen(false); }}
                className={`w-[95%] text-left rounded-full mx-2 px-4 py-3 flex items-center gap-4 transition-all ${activeTab === 'users' ? 'bg-secondary-container text-on-secondary-container font-bold' : 'text-on-surface-variant hover:bg-surface-container-high'}`}
              >
                <span className="material-symbols-outlined" style={{ fontVariationSettings: `'FILL' ${activeTab === 'users' ? 1 : 0}` }}>manage_accounts</span>
                Users
              </button>
            </li>
          )}
        </ul>

        <div className="px-lg pt-4 border-t border-outline-variant mt-auto">
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-full hover:bg-surface-container-high transition-all text-on-surface-variant"
          >
            <div className="flex items-center gap-4">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                {darkMode ? 'light_mode' : 'dark_mode'}
              </span>
              <span className="font-label-md text-label-md">{darkMode ? 'Light Mode' : 'Dark Mode'}</span>
            </div>
            <div className={`w-12 h-7 rounded-full flex items-center px-1 transition-colors ${darkMode ? 'bg-secondary-container' : 'bg-outline-variant'}`}>
              <div className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${darkMode ? 'translate-x-5' : 'translate-x-0'}`} />
            </div>
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 md:ml-80 flex flex-col h-screen overflow-hidden">
        <header className="md:hidden flex justify-between items-center px-margin-mobile h-14 w-full z-50 bg-surface dark:bg-inverse-surface border-b border-outline-variant dark:border-outline fixed top-0">
          <button
            aria-label="Open navigation menu"
            onClick={() => setMobileMenuOpen(true)}
            className="text-secondary p-2 rounded-full"
          >
            <span className="material-symbols-outlined">menu</span>
          </button>
          <div className="flex items-center">
            <FuegoLogo scale={0.6} />
          </div>
        </header>

        {/* Canvas */}
        <div className="flex-1 overflow-y-auto p-margin-mobile md:p-margin-desktop mt-14 md:mt-0 mb-16 md:mb-0">
          <div className="w-full flex flex-col gap-lg h-full">
            
            {/* Branch & Date selection */}
            <div className="relative rounded-2xl p-6 md:p-8 flex flex-col md:flex-row gap-6 md:gap-16 items-start md:items-center shadow-lg overflow-hidden border border-white/10 bg-slate-900 min-h-[100px]">
              {/* Background image - contained on the right so it doesn't zoom in */}
              <img src={fuegoWallImg} alt="" className="absolute inset-y-0 right-0 h-full w-1/2 object-contain object-right opacity-90" />
              {/* Subtle gradient to blend the image edge with the background */}
              <div className="absolute inset-0 bg-gradient-to-r from-slate-900 via-slate-900/90 to-transparent" />
              
              <div className="flex items-center gap-5 relative z-10 w-full md:w-auto">
                <div className="w-14 h-14 md:w-16 md:h-16 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-blue-300 text-3xl">store</span>
                </div>
                <div className="flex flex-col justify-center">
                  <label className="block font-label-md text-label-md text-blue-200/80 tracking-wider uppercase mb-1">Active Branch</label>
                  <select 
                    value={branchId} 
                    onChange={e => setBranchId(e.target.value)} 
                    className="bg-transparent border-0 text-xl md:text-2xl text-white font-bold p-0 py-1 focus:ring-0 cursor-pointer animate-none w-full"
                  >
                    <option value="1" className="text-slate-800">Branch 1 (Kira)</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-5 relative z-10 w-full md:w-auto">
                <div 
                  className="w-14 h-14 md:w-16 md:h-16 rounded-xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center shrink-0 cursor-pointer"
                  onClick={() => {
                    const el = document.getElementById('main-date-picker');
                    if (el && el.showPicker) el.showPicker();
                  }}
                >
                  <span className="material-symbols-outlined text-blue-300 text-3xl pointer-events-none">calendar_today</span>
                </div>
                <div className="flex flex-col justify-center">
                  <label 
                    className="block font-label-md text-label-md text-blue-200/80 tracking-wider uppercase mb-1 cursor-pointer"
                    onClick={() => {
                      const el = document.getElementById('main-date-picker');
                      if (el && el.showPicker) el.showPicker();
                    }}
                  >
                    Selected Date
                  </label>
                  <input 
                    id="main-date-picker"
                    type="date" 
                    value={date} 
                    onChange={e => setDate(e.target.value)} 
                    onClick={(e) => {
                      if (e.target.showPicker) e.target.showPicker();
                    }}
                    className="bg-transparent border-0 text-xl md:text-2xl text-white font-bold p-0 py-1 focus:ring-0 cursor-pointer [color-scheme:dark] w-full [&::-webkit-calendar-picker-indicator]:hidden"
                  />
                </div>
              </div>
            </div>

            {/* Notifications */}
            {message && (
              <div className="bg-emerald-100 border border-emerald-300 text-emerald-800 p-4 rounded-xl flex items-center gap-3">
                <span className="material-symbols-outlined">check_circle</span>
                <span className="font-body-sm">{message}</span>
              </div>
            )}
            {errorMsg && (
              <div className="bg-red-100 border border-red-300 text-red-800 p-4 rounded-xl flex items-center gap-3">
                <span className="material-symbols-outlined">error</span>
                <span className="font-body-sm">{errorMsg}</span>
              </div>
            )}

            <div className="mt-2 flex items-center justify-between gap-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/50 p-3 shadow-sm">
              <div className="flex items-center gap-3 min-w-0">
                {user?.profile_photo_url ? (
                  <img
                    src={`http://localhost:5000${user.profile_photo_url}`}
                    alt={`${user.name || 'User'} profile`}
                    className="h-10 w-10 rounded-full border border-slate-200 object-cover dark:border-slate-700"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                    <span className="material-symbols-outlined">person</span>
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Account</p>
                  <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{user?.name || 'Guest User'}</p>
                  <label className="mt-1 inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-blue-700 hover:underline dark:text-blue-300">
                    <span className="material-symbols-outlined text-[14px]">photo_camera</span>
                    {photoUploadingId === user?.id ? 'Uploading photo...' : user?.profile_photo_url ? 'Change my photo' : 'Add my photo'}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={photoUploadingId === user?.id}
                      className="sr-only"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file && user?.id) handleUserPhotoUpload(user.id, file);
                        event.target.value = '';
                      }}
                    />
                  </label>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 transition-colors dark:border-red-900/60 dark:bg-red-950/20 dark:text-red-300 dark:hover:bg-red-900/30"
              >
                <span className="material-symbols-outlined text-[18px]">logout</span>
                Sign Out
              </button>
            </div>

            {/* Tab: Dashboard (Overview) */}
            {activeTab === 'dashboard' && (
              <div className="flex flex-col gap-lg">

                {/* Warning Alerts / Running Low Banner */}
                {inventory.filter(item => (item.closing_stock !== undefined ? item.closing_stock : item.opening_stock) <= 5).length > 0 && (
                  <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 text-red-500 dark:text-red-400 rounded-xl">
                    <span className="material-symbols-outlined text-red-500">warning</span>
                    <span className="font-body-md text-body-md font-semibold">
                      {inventory.filter(item => (item.closing_stock !== undefined ? item.closing_stock : item.opening_stock) <= 5).length} product{inventory.filter(item => (item.closing_stock !== undefined ? item.closing_stock : item.opening_stock) <= 5).length > 1 ? 's' : ''} running low: {inventory.filter(item => (item.closing_stock !== undefined ? item.closing_stock : item.opening_stock) <= 5).map(i => i.name).join(', ')}
                    </span>
                  </div>
                )}

                {/* Grid of cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  
                  {/* Total In Stock */}
                  <div className="p-5 bg-surface-container-lowest rounded-xl border border-outline-variant/60 shadow-sm flex flex-col justify-between min-h-[120px]">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-bold tracking-wider">Total In Stock</span>
                      <span className="material-symbols-outlined text-amber-500" style={{ fontVariationSettings: "'FILL' 1" }}>inventory_2</span>
                    </div>
                    <div className="font-headline-lg text-headline-lg text-on-surface font-black mt-1">
                      {totalCurrentStock.toLocaleString()}
                    </div>
                  </div>

                  {/* Sold (All Time) */}
                  <div className="p-5 bg-surface-container-lowest rounded-xl border border-outline-variant/60 shadow-sm flex flex-col justify-between min-h-[120px]">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-bold tracking-wider">Sold (All Time)</span>
                      <span className="material-symbols-outlined text-orange-500" style={{ fontVariationSettings: "'FILL' 1" }}>arrow_circle_down</span>
                    </div>
                    <div className="font-headline-lg text-headline-lg text-on-surface font-black mt-1">
                      {inventory.reduce((sum, item) => sum + (Number(item.sold_stock) || 0), 0).toLocaleString()}
                    </div>
                  </div>

                  {/* Received (All Time) */}
                  <div className="p-5 bg-surface-container-lowest rounded-xl border border-outline-variant/60 shadow-sm flex flex-col justify-between min-h-[120px]">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-bold tracking-wider">Received (All Time)</span>
                      <span className="material-symbols-outlined text-teal-500" style={{ fontVariationSettings: "'FILL' 1" }}>arrow_circle_up</span>
                    </div>
                    <div className="font-headline-lg text-headline-lg text-on-surface font-black mt-1">
                      {inventory.reduce((sum, item) => sum + (Number(item.received_stock) || 0), 0).toLocaleString()}
                    </div>
                  </div>

                  {/* Damaged (All Time) */}
                  <div className="p-5 bg-surface-container-lowest rounded-xl border border-outline-variant/60 shadow-sm flex flex-col justify-between min-h-[120px]">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-bold tracking-wider">Damaged (All Time)</span>
                      <span className="material-symbols-outlined text-red-500" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
                    </div>
                    <div className="font-headline-lg text-headline-lg text-on-surface font-black mt-1">
                      {inventory.reduce((sum, item) => sum + (Number(item.damaged_stock) || 0), 0).toLocaleString()}
                    </div>
                  </div>

                </div>

                {/* Log a transaction Section */}
                <div className="flex flex-col gap-4 mt-2">
                  <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">Log a transaction</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    
                    {/* Sale Action */}
                    <button 
                      onClick={() => { setActiveTab('transaction'); setTxType('sale'); }}
                      className="flex flex-col items-center justify-center gap-3 p-5 bg-surface-container-lowest hover:bg-surface-container-low border border-outline-variant/60 hover:border-orange-500 rounded-xl transition-all shadow-sm group text-center"
                    >
                      <span className="material-symbols-outlined text-orange-500 text-3xl group-hover:scale-110 transition-transform">arrow_circle_down</span>
                      <span className="font-label-md text-label-md text-on-surface font-semibold">Sale</span>
                    </button>

                    {/* Received Action */}
                    <button 
                      onClick={() => { setActiveTab('inventory'); }}
                      className="flex flex-col items-center justify-center gap-3 p-5 bg-surface-container-lowest hover:bg-surface-container-low border border-outline-variant/60 hover:border-teal-500 rounded-xl transition-all shadow-sm group text-center"
                    >
                      <span className="material-symbols-outlined text-teal-500 text-3xl group-hover:scale-110 transition-transform">arrow_circle_up</span>
                      <span className="font-label-md text-label-md text-on-surface font-semibold">Received</span>
                    </button>

                    {/* Damaged Action */}
                    <button 
                      onClick={() => { setActiveTab('transaction'); setTxType('damaged'); }}
                      className="flex flex-col items-center justify-center gap-3 p-5 bg-surface-container-lowest hover:bg-surface-container-low border border-outline-variant/60 hover:border-red-500 rounded-xl transition-all shadow-sm group text-center"
                    >
                      <span className="material-symbols-outlined text-red-500 text-3xl group-hover:scale-110 transition-transform">warning</span>
                      <span className="font-label-md text-label-md text-on-surface font-semibold">Damaged</span>
                    </button>

                    {/* Adjustment Action */}
                    <button 
                      onClick={() => { setActiveTab('transaction'); setTxType('removed'); }}
                      className="flex flex-col items-center justify-center gap-3 p-5 bg-surface-container-lowest hover:bg-surface-container-low border border-outline-variant/60 hover:border-amber-500 rounded-xl transition-all shadow-sm group text-center"
                    >
                      <span className="material-symbols-outlined text-amber-500 text-3xl group-hover:scale-110 transition-transform">build</span>
                      <span className="font-label-md text-label-md text-on-surface font-semibold">Adjustment</span>
                    </button>

                  </div>
                </div>

                {/* Recent Activity Section */}
                <div className="flex flex-col gap-4 mt-2">
                  <div className="flex justify-between items-center">
                    <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">Recent activity</h3>
                    {recentTransactions.length > 0 && (
                      <button onClick={() => setActiveTab('transaction')} className="text-secondary font-label-md text-label-md hover:underline font-semibold">View All</button>
                    )}
                  </div>
                  
                  {recentTransactions.length === 0 ? (
                    <p className="font-body-md text-body-md text-on-surface-variant/80">No transactions logged yet.</p>
                  ) : (
                    <div className="divide-y divide-outline-variant bg-surface-container-lowest border border-outline-variant/60 rounded-xl p-4 shadow-sm max-h-[300px] overflow-y-auto no-scrollbar">
                      {recentTransactions.slice(0, 5).map((trx, idx) => (
                        <div key={idx} className="py-3 flex justify-between items-center first:pt-0 last:pb-0">
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center ${trx.color === 'error' ? 'text-error' : 'text-secondary'}`}>
                  <span className="material-symbols-outlined">{trx.icon === 'broken_image' ? 'warning' : 'shopping_cart'}</span>
                            </div>
                            <div>
                              <div className="font-label-md text-label-md text-on-surface font-semibold">{trx.name}</div>
                              <div className="font-label-sm text-label-sm text-outline">{trx.id} • {trx.date} • {trx.time} • by {trx.staff_name || trx.created_by_name}</div>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <div className="text-right">
                              <span className={`font-label-md text-label-md font-bold block ${trx.color === 'error' ? 'text-error' : 'text-on-surface'}`}>{trx.qty} Unit{trx.qty > 1 ? 's' : ''}</span>
                              <span className="font-label-sm text-label-sm text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full text-xs">{trx.status || 'pending'}</span>
                            </div>
                            <div className="flex gap-2 mt-1">
                              {user?.role === 'admin' && (trx.status === 'pending' || !trx.status) && (
                                <button onClick={() => handleConfirmTransaction(trx)} className="text-green-600 hover:text-green-700 font-label-sm text-xs flex items-center gap-1 transition-colors group">
                                  <span className="material-symbols-outlined text-[14px]">check_circle</span>
                                  <span className="opacity-0 group-hover:opacity-100 transition-opacity">Confirm</span>
                                </button>
                              )}
                              {user?.role === 'admin' && (
                                <button onClick={() => handleCancelTransaction(trx)} className="text-red-500 hover:text-red-600 font-label-sm text-xs flex items-center gap-1 transition-colors group">
                                  <span className="material-symbols-outlined text-[14px]">cancel</span>
                                  <span className="opacity-0 group-hover:opacity-100 transition-opacity">Cancel</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* Tab: Inventory Manager */}
            {activeTab === 'inventory' && (
              <div className="flex flex-col">
                <div className="w-full">
                  {/* Page header */}
                  <div className="mb-5 flex items-start justify-between">
                    <div>
                      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Inventory Management</h1>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        Edit opening, received, or closing stock and save your changes for the selected branch and date.
                      </p>
                    </div>
                    {user?.role === 'admin' && (
                      <button 
                        onClick={handleSaveInventory}
                        className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/20 hover:bg-blue-700"
                      >
                        <span className="material-symbols-outlined text-[16px]">save</span>
                        Save all changes
                      </button>
                    )}
                  </div>

                  {/* ONE outer card = the whole workspace, table + detail live inside it together */}
                  <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm">
                    {/* Shared toolbar strip spans the full width, so both halves visually start from the same bar */}
                    <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/50 px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[16px] text-blue-600 dark:text-blue-400">layers</span>
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">Stove Models</span>
                        <span className="rounded-full bg-blue-50 dark:bg-blue-900/40 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                          {inventory.length} models loaded
                        </span>
                      </div>
                      {user?.role === 'admin' && (
                        <button 
                          onClick={() => setShowAddProduct(true)}
                          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                        >
                          <span className="material-symbols-outlined text-[14px]">add</span>
                          Add product
                        </button>
                      )}
                    </div>

                    {/* Grid lives INSIDE the same card — divided by one shared border, not two separate boxes */}
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_320px]">
                      {/* Table half — NO fixed-width columns anywhere, so nothing is ever forced to
                          overflow sideways. Each row is a flex container that WRAPS its content onto
                          a second line on narrow screens instead of scrolling. */}
                      <div className="border-b border-slate-200 dark:border-slate-700 md:border-b-0 md:border-r">
                        <div className="hidden px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 sm:block">
                          Model / price
                        </div>
                        <div>
                          {inventory.map((m) => {
                            const isSelected = selectedStove && selectedStove.stove_id === m.stove_id;
                            return (
                              <button
                                key={m.stove_id}
                                onClick={() => setSelectedStove(m)}
                                className={`flex w-full flex-wrap items-center justify-between gap-y-2 border-l-[3px] px-5 py-3 text-left transition-colors ${
                                  isSelected
                                    ? "border-l-blue-600 bg-blue-50/60 dark:bg-blue-900/20"
                                    : "border-l-transparent hover:bg-slate-50 dark:hover:bg-slate-800/30"
                                }`}
                              >
                                {/* Left cluster: icon + name + price. min-w-0 lets the text truncate
                                    instead of pushing the row wider than its container. */}
                                <div className="flex min-w-0 items-center gap-3">
                                  <div
                                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg relative overflow-hidden group ${
                                      isSelected ? "bg-blue-600 text-white" : "bg-blue-50 dark:bg-slate-800 text-blue-600 dark:text-blue-400"
                                    }`}
                                  >
                                    {m.image_url ? (
                                      <img src={`http://localhost:5000${m.image_url}`} alt={m.name} className="w-full h-full object-cover" />
                                    ) : (
                                      <span className="material-symbols-outlined text-[18px]">local_fire_department</span>
                                    )}
                                    {user?.role === 'admin' && (
                                      <label className="absolute inset-0 bg-black/50 hidden group-hover:flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                        <span className="material-symbols-outlined text-white text-[16px]">upload</span>
                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                                          if (e.target.files && e.target.files[0]) {
                                            handleImageUpload(m.stove_id, e.target.files[0]);
                                          }
                                        }} />
                                      </label>
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                                      {m.name}
                                    </div>
                                    <div className="truncate text-xs text-slate-500 dark:text-slate-400">{Number(m.price).toLocaleString()} UGX</div>
                                  </div>
                                </div>

                                {/* Opening stock badge just sits at the row's natural width — no
                                    fixed pixel column reserved for it, so it flows with the content
                                    and wraps under the name on very narrow screens. */}
                                <div onClick={(e) => {
                                  // Prevent row selection if clicking the input itself
                                  if(e.target.tagName === 'INPUT') e.stopPropagation();
                                }}>
                                  {user?.role === 'admin' ? (
                                    <div className={`ml-11 flex items-center gap-2 shrink-0 rounded-md border px-2.5 py-1 text-sm sm:ml-0 ${
                                      isSelected
                                        ? "border-blue-300 dark:border-blue-700 bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-400"
                                        : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
                                    }`}>
                                      <span>Opening:</span>
                                      <input 
                                        type="number"
                                        className="w-12 bg-transparent outline-none font-semibold text-right"
                                        value={m.opening_stock || 0}
                                        min="0"
                                        onChange={(e) => handleStockChange(m.stove_id, 'opening_stock', e.target.value)}
                                      />
                                    </div>
                                  ) : (
                                    <span
                                      className={`ml-11 shrink-0 rounded-md border px-2.5 py-1 text-sm sm:ml-0 ${
                                        isSelected
                                          ? "border-blue-300 dark:border-blue-700 bg-white dark:bg-slate-900 font-semibold text-blue-700 dark:text-blue-400"
                                          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300"
                                      }`}
                                    >
                                      Opening: {m.opening_stock || 0}
                                    </span>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Detail half — same card, same background, connected by the shared border and by
                          highlight color matching the selected row instead of a disconnected floating panel */}
                      {selectedStove && (() => {
                        const closing = selectedStove.closing_stock !== undefined ? selectedStove.closing_stock : (selectedStove.opening_stock || 0);
                        const netFlow = closing - (selectedStove.opening_stock || 0);
                        return (
                          <div className="flex flex-col bg-slate-50/40 dark:bg-slate-800/20">
                            <div className="border-b border-slate-200 dark:border-slate-700 px-5 py-4">
                              <div className="flex items-center gap-3">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white relative overflow-hidden group">
                                  {selectedStove.image_url ? (
                                    <img src={`http://localhost:5000${selectedStove.image_url}`} alt={selectedStove.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="material-symbols-outlined text-[20px]">local_fire_department</span>
                                  )}
                                  {user?.role === 'admin' && (
                                    <label className="absolute inset-0 bg-black/50 hidden group-hover:flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">
                                      <span className="material-symbols-outlined text-white text-[18px]">upload</span>
                                      <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                                        if (e.target.files && e.target.files[0]) {
                                          handleImageUpload(selectedStove.stove_id, e.target.files[0]);
                                        }
                                      }} />
                                    </label>
                                  )}
                                </div>
                                <div className="flex-1 flex flex-col gap-1.5">
                                  {user?.role === 'admin' ? (
                                    <>
                                      <div className="relative group">
                                        <input 
                                          type="text" 
                                          className="text-sm font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md focus:border-blue-500 outline-none w-full px-2 py-1 transition-colors pr-6 shadow-sm"
                                          defaultValue={selectedStove.name}
                                          onBlur={(e) => {
                                            if (e.target.value !== selectedStove.name) {
                                              handleStoveUpdate(selectedStove.stove_id, e.target.value, selectedStove.raw_price || selectedStove.price);
                                            }
                                          }}
                                          title="Edit stove name"
                                        />
                                        <span className="material-symbols-outlined absolute right-1.5 top-1/2 -translate-y-1/2 text-[14px] text-slate-400 pointer-events-none group-hover:text-blue-500">edit</span>
                                      </div>
                                      <div className="relative group flex items-center gap-1 w-32">
                                        <div className="relative flex-1">
                                          <input 
                                            type="number" 
                                            min="0"
                                            max="99999999.99"
                                            step="0.01"
                                            className="text-xs font-semibold text-slate-900 dark:text-white bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md focus:border-blue-500 outline-none w-full px-2 py-1 transition-colors pr-5 shadow-sm"
                                            defaultValue={Number(selectedStove.price).toFixed(2)}
                                            onBlur={(e) => {
                                              if (Number(e.target.value) !== Number(selectedStove.price)) {
                                                handleStoveUpdate(selectedStove.stove_id, selectedStove.name, e.target.value);
                                              }
                                            }}
                                            title="Edit stove price"
                                          />
                                          <span className="material-symbols-outlined absolute right-1 top-1/2 -translate-y-1/2 text-[12px] text-slate-400 pointer-events-none group-hover:text-blue-500">edit</span>
                                        </div>
                                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">UGX</span>
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <div className="text-sm font-bold text-slate-900 dark:text-white">{selectedStove.name}</div>
                                      <div className="text-xs text-slate-500 dark:text-slate-400">{Number(selectedStove.price).toLocaleString()} UGX</div>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="mt-3 flex items-end gap-2">
                                {user?.role === 'admin' ? (
                                  <input
                                    type="number"
                                    className="text-3xl font-bold text-slate-900 dark:text-white bg-transparent border-b border-slate-300 dark:border-slate-600 w-24 outline-none"
                                    value={closing}
                                    min="0"
                                    onChange={(e) => handleStockChange(selectedStove.stove_id, 'closing_stock', e.target.value)}
                                  />
                                ) : (
                                  <span className="text-3xl font-bold text-slate-900 dark:text-white">{closing}</span>
                                )}
                                <span className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                                  closing
                                </span>
                              </div>
                              {user?.role === 'admin' && (
                                <div className="mt-3 flex items-center gap-2">
                                  <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Received Stock:</span>
                                  <input
                                    type="number"
                                    className="text-sm font-bold text-slate-900 dark:text-white bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 w-20 outline-none"
                                    value={selectedStove.received_stock || 0}
                                    min="0"
                                    onChange={(e) => handleStockChange(selectedStove.stove_id, 'received_stock', e.target.value)}
                                  />
                                </div>
                              )}
                              {user?.role === 'admin' && (
                                <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-700">
                                  {selectedStove.inventory_record_id ? (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteStockRecord(selectedStove)}
                                      disabled={deletingStockRecord}
                                      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900 dark:hover:bg-red-950/40"
                                    >
                                      <span className="material-symbols-outlined text-[16px]">delete</span>
                                      {deletingStockRecord ? 'Deleting...' : `Delete ${date} stock record`}
                                    </button>
                                  ) : (
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                      No saved stock record for this stove on {date}. Save changes to create one.
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>

                            <div className="grid grid-cols-2 divide-x divide-slate-200 dark:divide-slate-700 border-b border-slate-200 dark:border-slate-700">
                              <div className="px-5 py-3.5">
                                <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                                  Opening
                                </div>
                                <div className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{selectedStove.opening_stock || 0}</div>
                                <div className="text-[11px] text-slate-400">Starting level</div>
                              </div>
                              <div className="px-5 py-3.5">
                                <div className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                                  <span className="material-symbols-outlined text-[11px]">north_east</span>
                                  Net flow
                                </div>
                                <div
                                  className={`mt-1 text-lg font-bold ${
                                    netFlow < 0 ? "text-red-600" : netFlow > 0 ? "text-emerald-600" : "text-slate-900 dark:text-white"
                                  }`}
                                >
                                  {netFlow > 0 ? "+" : ""}
                                  {netFlow}
                                </div>
                                <div className="text-[11px] text-slate-400">Today's change</div>
                              </div>
                            </div>

                            <div className="flex-1 px-5 py-4">
                              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                <span className="material-symbols-outlined text-[13px]">schedule</span>
                                Logged movement
                              </div>
                              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                                Auto-calculated closing stock level verified.
                              </p>
                              <p className="mt-2 text-[11px] text-slate-400">Recorded for {date}</p>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Record Transaction */}
            {activeTab === 'transaction' && (
              <div className="flex flex-col gap-lg">
                {/* Title */}
                <div className="text-center mb-4">
                  <h1 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface font-bold">
                    Record Transaction
                  </h1>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-2">
                    Log sales, removals, or damaged inventory for branch records.
                  </p>
                </div>

                <div className="grid md:grid-cols-[1fr_1.1fr] gap-6">
                  {/* Left: Form */}
                  <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl p-5 flex flex-col gap-4 h-fit shadow-sm">
                    <div>
                      <label className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide block mb-2 font-semibold">Stove Model</label>
                      <select 
                        value={txStoveId} 
                        onChange={(e) => {
                          setTxStoveId(e.target.value);
                          const found = inventory.find(m => m.stove_id === Number(e.target.value));
                          if (found) setTxPrice(found.price);
                        }} 
                        className="w-full h-12 px-4 border border-outline-variant rounded-lg font-body-md text-body-md text-on-surface bg-surface-container-lowest focus:ring-1 focus:ring-secondary outline-none"
                      >
                        <option value="">Select a model...</option>
                        {inventory.map((m) => (
                          <option key={m.stove_id} value={m.stove_id}>{m.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide block mb-2 font-semibold">Action Type</label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { id: "sale", label: "Sale", icon: "arrow_circle_down", color: "text-orange-500", border: "hover:border-orange-500/50" },
                          { id: "removed", label: "Removed", icon: "logout", color: "text-amber-600", border: "hover:border-amber-500/50" },
                          { id: "damaged", label: "Damaged", icon: "warning", color: "text-red-500", border: "hover:border-red-500/50" },
                          { id: "returned", label: "Returned", icon: "replay", color: "text-teal-500", border: "hover:border-teal-500/50" },
                        ].map((t) => {
                          const active = txType === t.id;
                          return (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => setTxType(t.id)}
                              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-semibold transition-all ${active ? 'bg-surface-container-low border-secondary text-secondary' : 'bg-transparent border-outline-variant/60 text-on-surface-variant'} ${t.border}`}
                            >
                              <span className={`material-symbols-outlined ${t.color}`} style={{ fontSize: '18px' }}>{t.icon}</span>
                              <span>{t.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide block mb-2 font-semibold">Quantity</label>
                        <input 
                          type="number" 
                          min="1" 
                          value={txQty} 
                          onChange={(e) => setTxQty(e.target.value)} 
                          className="w-full h-12 px-4 border border-outline-variant rounded-lg font-body-md text-body-md text-on-surface bg-surface-container-lowest focus:ring-1 focus:ring-secondary outline-none font-mono" 
                        />
                      </div>
                      <div>
                        <label className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide block mb-2 font-semibold">Unit Price (UGX)</label>
                        <input 
                          type="number" 
                          min="0" 
                          value={txPrice} 
                          onChange={(e) => setTxPrice(e.target.value)} 
                          className="w-full h-12 px-4 border border-outline-variant rounded-lg font-body-md text-body-md text-on-surface bg-surface-container-lowest focus:ring-1 focus:ring-secondary outline-none font-mono" 
                        />
                      </div>
                    </div>

                    <div>
                      <label className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide block mb-2 font-semibold">Notes (Optional)</label>
                      <input 
                        value={txNotes} 
                        onChange={(e) => setTxNotes(e.target.value)} 
                        placeholder="e.g. cracked lid, customer return..." 
                        className="w-full h-12 px-4 border border-outline-variant rounded-lg font-body-md text-body-md text-on-surface bg-surface-container-lowest focus:ring-1 focus:ring-secondary outline-none" 
                      />
                    </div>

                    {user?.role === 'staff' && (
                      <div>
                        <label className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wide block mb-2 font-semibold">Your Name (Optional)</label>
                        <input 
                          value={txStaffName} 
                          onChange={(e) => setTxStaffName(e.target.value)} 
                          placeholder="e.g. John Doe" 
                          className="w-full h-12 px-4 border border-outline-variant rounded-lg font-body-md text-body-md text-on-surface bg-surface-container-lowest focus:ring-1 focus:ring-secondary outline-none" 
                        />
                      </div>
                    )}

                    <button
                      onClick={handleRecordTransaction}
                      className="flex items-center justify-center gap-2 h-12 bg-secondary text-white rounded-lg font-label-md text-label-md hover:bg-secondary/95 transition-all shadow-sm font-bold mt-2"
                      type="button"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>send</span>
                      Record Transaction
                    </button>
                  </div>

                  {/* Right: Log */}
                  <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                      <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                        Daily Records Log
                      </h2>
                      <div className="flex items-center gap-2">
                        <button
                          className="flex items-center gap-1.5 bg-surface-container border border-outline-variant/60 rounded-lg px-2.5 py-1.5 text-sm text-on-surface-variant hover:bg-surface-container-high transition-colors cursor-pointer"
                          onClick={() => {
                            const el = document.getElementById('log-date-picker');
                            if (el && el.showPicker) el.showPicker();
                          }}
                        >
                          <span className="material-symbols-outlined text-secondary" style={{ fontSize: '16px' }}>calendar_today</span>
                          <span className="font-label-sm text-label-sm font-semibold">{new Date(date + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                          <input
                            id="log-date-picker"
                            type="date"
                            value={date}
                            onChange={e => setDate(e.target.value)}
                            className="absolute opacity-0 w-0 h-0 pointer-events-none"
                          />
                        </button>
                        <span className="font-label-sm text-label-sm text-secondary bg-surface-container-low border border-secondary/20 px-3 py-1 rounded-full font-mono font-semibold">
                          Recent Log: {recentTransactions.length} Item{recentTransactions.length === 1 ? "" : "s"}
                        </span>
                      </div>
                    </div>

                    {recentTransactions.length === 0 ? (
                      <div className="flex flex-col items-center text-center py-16 px-4">
                        <div className="w-14 h-14 bg-surface-container rounded-xl flex items-center justify-center mb-4">
                          <span className="material-symbols-outlined text-outline" style={{ fontSize: '28px' }}>scrollable_header</span>
                        </div>
                        <p className="font-label-md text-label-md text-on-surface font-semibold">No transactions recorded yet today</p>
                        <p className="font-body-sm text-body-sm text-outline mt-1.5 max-w-[240px]">
                          Use the form on the left to record sales, returns, damaged stock or transfers.
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2.5 max-h-[420px] overflow-y-auto pr-1 no-scrollbar">
                        {recentTransactions.map((e, idx) => {
                          const actionMeta = [
                            { id: "sale", label: "Sale", icon: "arrow_circle_down", color: "text-orange-500", bg: "bg-orange-500/10 border-orange-500/20" },
                            { id: "removed", label: "Removed", icon: "logout", color: "text-amber-600", bg: "bg-amber-500/10 border-amber-500/20" },
                            { id: "damaged", label: "Damaged", icon: "warning", color: "text-red-500", bg: "bg-red-500/10 border-red-500/20" },
                            { id: "returned", label: "Returned", icon: "replay", color: "text-teal-500", bg: "bg-teal-500/10 border-teal-500/20" },
                          ].find(t => t.id === e.type.toLowerCase()) || { id: "sale", label: "Sale", icon: "arrow_circle_down", color: "text-orange-500", bg: "bg-orange-500/10 border-orange-500/20" };

                          return (
                            <div key={idx} className="bg-surface-container-low border border-outline-variant/60 rounded-xl flex items-start gap-3 p-3 shadow-sm">
                              <div className={`p-2 rounded-lg flex-shrink-0 flex items-center justify-center border ${actionMeta.bg}`}>
                                <span className={`material-symbols-outlined ${actionMeta.color}`} style={{ fontSize: '18px' }}>{actionMeta.icon}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-label-md text-label-md text-on-surface font-semibold truncate">{e.name}</span>
                                  <span className={`font-label-sm text-label-sm font-semibold flex-shrink-0 ${actionMeta.color}`}>
                                    {actionMeta.label} · {e.qty}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between mt-0.5">
                                  <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                      <div className="font-label-sm text-label-sm text-outline font-mono">
                                        {e.price} · {e.date} · {e.time}
                                      </div>
                                      {e.status === 'confirmed' ? (
                                        <span className="bg-green-100 text-green-700 text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-sm">Confirmed</span>
                                      ) : (
                                        <span className="bg-red-100 text-red-700 text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-sm flex items-center gap-0.5">
                                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span> Pending
                                        </span>
                                      )}
                                    </div>
                                    {(e.staff_name || e.created_by_name) && (
                                      <span className="font-label-sm text-[10px] text-on-surface-variant/70 mt-0.5">By: {e.staff_name || e.created_by_name}</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    {user?.role === 'admin' && e.status === 'pending' && (
                                      <button onClick={() => handleConfirmTransaction(e)} className="text-green-600 hover:bg-green-50 px-2 py-1 rounded-md transition-colors flex items-center justify-center font-bold text-xs" title="Confirm Transaction">
                                        Confirm
                                      </button>
                                    )}
                                    {user?.role === 'admin' && (
                                      <button onClick={() => handleCancelTransaction(e)} className="text-red-500 hover:bg-red-50 p-1 rounded-md transition-colors flex items-center justify-center" title="Cancel Transaction">
                                        <span className="material-symbols-outlined text-[16px]">cancel</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                                {e.notes && (
                                  <div className="font-body-sm text-body-sm text-outline mt-1 italic truncate">{e.notes}</div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Quotations & Receipts */}
            {activeTab === 'quotations' && (
              <div className="flex flex-col gap-lg pb-10">
                {qView === "list" && (
                  <div className="flex flex-col gap-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0 py-1 px-2 bg-white rounded-xl border border-outline-variant shadow-sm">
                          <FuegoLogo scale={0.6} />
                        </div>
                        <div>
                          <h1 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface font-bold">Quotations & receipts</h1>
                          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">Create professional quotations and receipts for your customers.</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            setQDocType("receipt");
                            setQEditing(null);
                            setQCustomer("");
                            setQPhone("");
                            setQAddress("");
                            setQItems([createEmptyQItem()]);
                            setQNotes("Thank you for your business.");
                            setQAmountPaid("");
                            setQView("editor");
                          }} 
                          className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-outline-variant/60 hover:bg-surface-container-low font-label-md text-label-md font-semibold text-on-surface transition-all"
                        >
                          <span className="material-symbols-outlined text-secondary" style={{ fontSize: '18px' }}>receipt</span> New receipt
                        </button>
                        <button 
                          onClick={() => {
                            setQDocType("quotation");
                            setQEditing(null);
                            setQCustomer("");
                            setQPhone("");
                            setQAddress("");
                            setQItems([createEmptyQItem()]);
                            setQNotes("Valid for 14 days from date of issue.");
                            setQAmountPaid("");
                            setQView("editor");
                          }} 
                          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-secondary text-white font-label-md text-label-md font-semibold hover:bg-secondary/95 transition-all shadow-sm"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add</span> New quotation
                        </button>
                      </div>
                    </div>

                    <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl overflow-hidden shadow-sm">
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse">
                        <thead className="bg-surface-container-low border-b border-outline-variant">
                          <tr>
                            {["No.", "Customer", "Date", "Type", "Amount", "Status", "Created By", ""].map((h) => (
                              <th key={h} className="text-left font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider px-6 py-3 font-semibold">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/60">
                          {qRecords.length === 0 ? (
                            <tr>
                              <td colSpan={8} className="px-6 py-12 text-center text-on-surface-variant/80 font-body-md">
                                No quotations logged yet. Use the buttons above to create one.
                              </td>
                            </tr>
                          ) : (
                            qRecords.map((r) => {
                              const totalAmt = getItemTotal(r.items || []);
                              const paidAmount = r.type === 'receipt' ? Number(r.amount_paid || 0) : totalAmt;
                              const statusText = r.type === 'receipt' ? getReceiptStatus(r.amount_paid, totalAmt) : (r.status || 'Draft');
                              return (
                                <tr 
                                  key={r.id} 
                                  onClick={() => {
                                    setQEditing(r);
                                    setQDocType(r.type);
                                    setQView("preview");
                                  }}
                                  className="hover:bg-surface-container-low/30 transition-colors cursor-pointer"
                                >
                                  <td className="px-6 py-4 font-mono font-label-md text-label-md text-secondary font-bold whitespace-nowrap">{r.id}</td>
                                  <td className="px-6 py-4 font-label-md text-label-md text-on-surface font-semibold whitespace-nowrap">{r.customer}</td>
                                  <td className="px-6 py-4 font-body-sm text-body-sm text-on-surface-variant whitespace-nowrap">
                                    {new Date(r.date).toLocaleDateString("en-GB", { day: 'numeric', month: 'short', year: 'numeric' })}
                                  </td>
                                  <td className="px-6 py-4 font-body-sm text-body-sm capitalize text-on-surface-variant whitespace-nowrap">{r.type}</td>
                                  <td className="px-6 py-4 font-label-md text-label-md text-on-surface font-bold whitespace-nowrap">UGX {paidAmount.toLocaleString()}</td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`text-xs px-2 py-0.5 rounded font-semibold font-mono ${statusText === "Paid" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : statusText === "Partially Paid" ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : statusText === "Unpaid" ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" : statusText === "Sent" ? "bg-secondary-container text-on-secondary-container" : "bg-surface-container-high text-on-surface-variant"}`}>{statusText}</span>
                                  </td>
                                  <td className="px-6 py-4 font-body-sm text-body-sm text-on-surface-variant whitespace-nowrap">
                                    {r.created_by_name || 'System'}
                                  </td>
                                  <td className="px-6 py-4 text-right text-outline whitespace-nowrap">
                                    <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>chevron_right</span>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                    </div>
                  </div>
                )}

                {qView === "editor" && (
                  <div className="max-w-3xl flex flex-col gap-6">
                    <div>
                      <button 
                        onClick={() => setQView("list")} 
                        className="flex items-center gap-1.5 font-label-md text-label-md text-on-surface-variant hover:text-on-surface mb-4 transition-colors"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span> Back to list
                      </button>
                      <div className="flex items-center gap-4">
                        <div className="flex-shrink-0 py-2 px-2 bg-white rounded-xl border border-outline-variant shadow-sm">
                          <FuegoLogo scale={0.8} />
                        </div>
                        <div>
                          <h1 className="font-headline-lg text-headline-lg text-on-surface font-bold capitalize">New {qDocType}</h1>
                          <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">Fill in customer and item details below.</p>
                        </div>
                      </div>
                    </div>

                    {/* Customer details */}
                    <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl p-5 shadow-sm flex flex-col gap-4">
                      <h3 className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">Customer details</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block font-label-sm text-label-sm text-outline mb-1.5">Customer name</label>
                          <input 
                            value={qCustomer} 
                            onChange={(e) => setQCustomer(e.target.value)} 
                            placeholder="e.g. James Okello" 
                            className="w-full h-11 px-4 border border-outline-variant rounded-lg font-body-md text-body-md text-on-surface bg-surface-container-lowest focus:ring-1 focus:ring-secondary outline-none" 
                          />
                        </div>
                        <div>
                          <label className="block font-label-sm text-label-sm text-outline mb-1.5">Phone number</label>
                          <input 
                            value={qPhone} 
                            onChange={(e) => setQPhone(e.target.value)} 
                            placeholder="07XX XXX XXX" 
                            className="w-full h-11 px-4 border border-outline-variant rounded-lg font-body-md text-body-md text-on-surface bg-surface-container-lowest focus:ring-1 focus:ring-secondary outline-none" 
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block font-label-sm text-label-sm text-outline mb-1.5">Address (optional)</label>
                          <input 
                            value={qAddress} 
                            onChange={(e) => setQAddress(e.target.value)} 
                            placeholder="e.g. Kira Town, Wakiso" 
                            className="w-full h-11 px-4 border border-outline-variant rounded-lg font-body-md text-body-md text-on-surface bg-surface-container-lowest focus:ring-1 focus:ring-secondary outline-none" 
                          />
                        </div>
                      </div>
                    </div>

                    {/* Items grid */}
                    <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl p-5 shadow-sm">
                      <div className="flex items-center justify-between mb-4 border-b border-outline-variant/60 pb-3">
                        <h3 className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-bold">Items</h3>
                        <button 
                          onClick={() => setQItems(prev => [...prev, createEmptyQItem()])} 
                          className="flex items-center gap-1 font-label-sm text-label-sm text-secondary hover:underline font-bold"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>add</span> Add item
                        </button>
                      </div>

                      <div className="flex flex-col gap-3">
                        {qItems.map((it) => {
                          const matchingInventoryItem = inventory.find((p) => p.name === it.item);
                          const isPriceLocked = Boolean(matchingInventoryItem);

                          const handleItemChange = (nextItemName) => {
                            const selectedProduct = inventory.find((p) => p.name === nextItemName);
                            updateQItem(it.key, {
                              item: nextItemName,
                              price: selectedProduct ? Number(selectedProduct.price) : it.price
                            });
                          };

                          return (
                            <div key={it.key} className="flex flex-col gap-2">
                              <div className="flex items-center gap-3">
                                <div className="flex-1">
                                  <input 
                                    list={`stoves-list-${it.key}`}
                                    value={it.item} 
                                    onChange={(e) => handleItemChange(e.target.value)} 
                                    placeholder="Select stove or enter custom item..."
                                    className="w-full h-11 px-3 border border-outline-variant rounded-lg font-body-md text-body-md text-on-surface bg-surface-container-lowest focus:ring-1 focus:ring-secondary outline-none"
                                  />
                                  <datalist id={`stoves-list-${it.key}`}>
                                    {inventory.map((p) => (
                                      <option key={p.stove_id} value={p.name} />
                                    ))}
                                  </datalist>
                                </div>
                                <input 
                                  type="number" 
                                  min="1" 
                                  value={it.qty} 
                                  onChange={(e) => updateQItem(it.key, { qty: Math.max(1, Number(e.target.value)) })} 
                                  className="w-20 h-11 border border-outline-variant rounded-lg font-body-md text-body-md text-on-surface bg-surface-container-lowest focus:ring-1 focus:ring-secondary outline-none text-center font-mono" 
                                />
                                <input 
                                  type="number" 
                                  min="0" 
                                  value={it.price} 
                                  onChange={(e) => updateQItem(it.key, { price: Number(e.target.value) })} 
                                  readOnly={isPriceLocked}
                                  className={`w-32 h-11 border border-outline-variant rounded-lg font-body-md text-body-md text-on-surface bg-surface-container-lowest focus:ring-1 focus:ring-secondary outline-none text-right font-mono ${isPriceLocked ? 'cursor-not-allowed opacity-80' : ''}`} 
                                />
                                <div className="w-32 text-right font-mono font-label-md text-label-md font-bold text-on-surface-variant">
                                  UGX {(it.qty * it.price).toLocaleString()}
                                </div>
                                <button 
                                  onClick={() => {
                                    setQItems(prev => prev.length > 1 ? prev.filter((i) => i.key !== it.key) : prev);
                                  }} 
                                  className="text-on-surface-variant hover:text-error transition-colors p-2 rounded-full hover:bg-surface-container-low"
                                >
                                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="border-t border-outline-variant/60 mt-5 pt-4 flex justify-end">
                        <div className="w-64 flex flex-col gap-1.5">
                          <div className="flex justify-between font-body-sm text-body-sm text-outline">
                            <span>Subtotal</span>
                            <span className="font-mono">UGX {qItems.reduce((sum, it) => sum + (it.qty * it.price), 0).toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between font-bold text-on-surface font-headline-sm text-headline-sm pt-2 border-t border-outline-variant/60">
                            <span>Total</span>
                            <span className="font-mono text-secondary">UGX {qItems.reduce((sum, it) => sum + (it.qty * it.price), 0).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {qDocType === "receipt" && (
                      <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl p-5 shadow-sm flex flex-col gap-2">
                        <label className="block font-label-sm text-label-sm text-outline">Amount paid (UGX)</label>
                        <input 
                          type="number" 
                          value={qAmountPaid} 
                          onChange={(e) => setQAmountPaid(e.target.value)} 
                          placeholder={String(qItems.reduce((sum, it) => sum + (it.qty * it.price), 0))} 
                          className="w-56 h-11 px-4 border border-outline-variant rounded-lg font-body-md text-body-md text-on-surface bg-surface-container-lowest focus:ring-1 focus:ring-secondary outline-none font-mono" 
                        />
                      </div>
                    )}

                    <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl p-5 shadow-sm">
                      <label className="block font-label-sm text-label-sm text-outline mb-1.5">Notes / terms</label>
                      <textarea 
                        value={qNotes} 
                        onChange={(e) => setQNotes(e.target.value)} 
                        rows={2} 
                        className="w-full p-3 border border-outline-variant rounded-lg font-body-md text-body-md text-on-surface bg-surface-container-lowest focus:ring-1 focus:ring-secondary outline-none resize-none" 
                      />
                    </div>

                    <div className="flex justify-end gap-2">
                      <button 
                        onClick={() => setQView("list")} 
                        className="px-5 py-2.5 rounded-lg border border-outline-variant/60 hover:bg-surface-container-low font-label-md text-label-md font-semibold text-on-surface-variant transition-all"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={() => {
                          const totalAmt = getItemTotal(qItems);
                          const paidAmt = qDocType === "receipt" ? Number(qAmountPaid || 0) : 0;
                          let recId;
                          if (qEditing && qEditing.id) {
                            recId = qEditing.id;
                          } else {
                            const prefix = qDocType === "quotation" ? "QT" : "RC";
                            const count = qRecords.filter((r) => r.type === qDocType).length + 1;
                            recId = `${prefix}-${String(count).padStart(4, "0")}`;
                          }
                          const rec = {
                            id: recId,
                            branch_id: branchId,
                            type: qDocType,
                            customer: qCustomer || "Walk-in Customer",
                            phone: qPhone,
                            address: qAddress,
                            date: (qEditing && qEditing.date) ? qEditing.date : new Date().toISOString().split('T')[0],
                            items: qItems.map(it => {
                              return { item: it.item || "Custom Item", qty: it.qty, price: it.price };
                            }),
                            notes: qNotes,
                            amount_paid: qDocType === "receipt" ? String(paidAmt) : null,
                            status: qDocType === "quotation" ? "Draft" : getReceiptStatus(paidAmt, totalAmt),
                          };
                          
                          axios.post('http://localhost:5000/api/quotations', rec)
                            .then(() => {
                                setMessage(`${qDocType === "quotation" ? "Quotation" : "Receipt"} saved successfully`);
                                loadQuotations();
                                setQEditing(rec);
                                setQView("preview");
                                setTimeout(() => setMessage(""), 3000);
                            })
                            .catch(err => {
                                console.error("Save error:", err);
                                setErrorMsg("Failed to save. Please try again.");
                                setTimeout(() => setErrorMsg(""), 3000);
                            });
                        }} 
                        className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-secondary text-white font-label-md text-label-md font-semibold hover:bg-secondary/95 transition-all shadow-sm"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>check_circle</span> Save {qDocType}
                      </button>
                    </div>
                  </div>
                )}

                {qView === "preview" && qEditing && (
                  <div className="max-w-3xl flex flex-col gap-6">
                    <div className="print:hidden flex items-center justify-between gap-4">
                      <button 
                        onClick={() => setQView("list")} 
                        className="flex items-center gap-1.5 font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_back</span> Back to list
                      </button>
                      <div className="flex gap-2">
                        {user?.role === 'admin' && (
                          <>
                            <button 
                              onClick={() => {
                                if(window.confirm("Are you sure you want to delete this document?")) {
                                    axios.delete(`http://localhost:5000/api/quotations/${qEditing.id}`)
                                        .then(() => {
                                            setMessage("Deleted successfully");
                                            loadQuotations();
                                            setQView("list");
                                            setTimeout(() => setMessage(""), 3000);
                                        })
                                        .catch(err => {
                                            console.error(err);
                                            setErrorMsg("Failed to delete");
                                            setTimeout(() => setErrorMsg(""), 3000);
                                        });
                                }
                              }} 
                              className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-red-500/30 text-red-600 hover:bg-red-500/10 font-label-md text-label-md font-semibold transition-all"
                            >
                              <span className="material-symbols-outlined text-red-600" style={{ fontSize: '18px' }}>delete</span> Delete
                            </button>
                            <button 
                              onClick={() => {
                                setQDocType(qEditing.type);
                                setQCustomer(qEditing.customer);
                                setQPhone(qEditing.phone);
                                setQAddress(qEditing.address);
                                setQItems(qEditing.items.map(it => {
                                  return { 
                                    key: Math.random().toString(36).slice(2, 10), 
                                    item: it.item,
                                    qty: it.qty, 
                                    price: it.price 
                                  };
                                }));
                                setQNotes(qEditing.notes);
                                setQAmountPaid(qEditing.amount_paid || "");
                                setQView("editor");
                              }} 
                              className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-outline-variant/60 hover:bg-surface-container-low font-label-md text-label-md font-semibold text-on-surface transition-all"
                            >
                              <span className="material-symbols-outlined text-secondary" style={{ fontSize: '18px' }}>edit</span> Edit
                            </button>
                          </>
                        )}
                        <button 
                          onClick={() => window.print()} 
                          className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-outline-variant/60 hover:bg-surface-container-low font-label-md text-label-md font-semibold text-on-surface transition-all"
                        >
                          <span className="material-symbols-outlined text-secondary" style={{ fontSize: '18px' }}>print</span> Print
                        </button>
                        <button 
                          onClick={() => window.print()} 
                          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-secondary text-white font-label-md text-label-md font-semibold hover:bg-secondary/95 transition-all shadow-sm"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>download</span> Save as PDF
                        </button>
                      </div>
                    </div>

                    <>
                      {qEditing.type === 'quotation' ? (
                        <div id="printable" className="bg-white text-slate-800 p-8 shadow-sm flex flex-col mx-auto w-full max-w-[800px] border border-slate-200 min-h-[600px] relative" style={{ fontFamily: "'Segoe UI', Arial, sans-serif" }}>
                          {/* Header */}
                          <div className="flex justify-between items-start">
                            <div className="flex items-center gap-3">
                              <div className="pt-1">
                                <FuegoLogo scale={1.1} />
                              </div>
                              <div>
                                <div className="text-[12px] text-slate-600 leading-snug mt-1 font-medium">
                                  Location: (Kira Mamerito Road), P.O. Box, 113108 Wakiso<br/>
                                  Email: fuegouganda@gmail.com
                                </div>
                              </div>
                            </div>
                            <div className="text-right text-[12px] text-slate-600 leading-snug font-medium pt-2">
                              Tel: +256 760033623<br/>
                              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+256 751692751<br/>
                              <span className="inline-flex items-center gap-1">
                                <span className="text-green-600 text-[11px]">●</span> 0788837621
                              </span>
                            </div>
                          </div>

                          {/* Proforma Invoice Badge */}
                          <div className="mt-5 flex items-center gap-4">
                            <div className="flex items-center gap-3">
                              <span className="text-red-500 font-bold text-2xl">{qEditing.id.replace('QT-', '')}</span>
                              <div className="bg-[#2A3457] text-white text-sm font-bold px-4 py-1.5 tracking-wide">
                                PROFORMA INVOICE
                              </div>
                            </div>
                          </div>

                          {/* Details Row */}
                          <div className="mt-4 flex flex-col gap-3 text-[14px]">
                            <div className="flex gap-8">
                              <div className="flex gap-2 items-end">
                                <span className="font-bold text-slate-800">No.</span>
                                <span className="border-b-[1.5px] border-dotted border-slate-400 pb-0.5 px-3 min-w-[80px] text-blue-900 font-semibold">{qEditing.id.replace('QT-', '')}</span>
                              </div>
                            </div>
                            <div className="flex gap-2 items-end">
                              <span className="font-bold text-slate-800">Date:</span>
                              <span className="border-b-[1.5px] border-dotted border-slate-400 pb-0.5 px-3 min-w-[200px] text-blue-900 font-semibold">{qEditing.date ? qEditing.date.split('T')[0] : ''}</span>
                            </div>
                            <div className="flex gap-2 items-end w-full">
                              <span className="font-bold text-slate-800 whitespace-nowrap">M/s:</span>
                              <span className="border-b-[1.5px] border-dotted border-slate-400 pb-0.5 flex-1 text-blue-900 font-semibold px-3 uppercase tracking-wide">
                                {qEditing.customer}
                              </span>
                            </div>
                            {qEditing.phone && (
                              <div className="flex gap-2 items-end w-full">
                                <span className="font-bold text-slate-800 whitespace-nowrap">Phone:</span>
                                <span className="border-b-[1.5px] border-dotted border-slate-400 pb-0.5 flex-1 text-blue-900 font-semibold px-3">
                                  {qEditing.phone}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Category Checkboxes */}
                          <div className="mt-4 flex items-center gap-6 text-[13px] font-bold text-slate-700">
                            {['FABRICATION', 'SOLAR STOVES', 'FURNITURE', 'CONSTRUCTION'].map((cat) => {
                              const isChecked = (qEditing.notes || '').toLowerCase().includes(cat.toLowerCase());
                              return (
                                <label key={cat} className="flex items-center gap-1.5 cursor-default">
                                  <span className={`w-4 h-4 border-[1.5px] rounded-sm flex items-center justify-center text-[10px] ${isChecked ? 'border-red-500 bg-red-50 text-red-600' : 'border-slate-400 bg-white'}`}>
                                    {isChecked ? '✓' : ''}
                                  </span>
                                  {cat}
                                </label>
                              );
                            })}
                          </div>

                          {/* Items Table */}
                          <div className="mt-5 border border-slate-400 flex-1">
                            <table className="w-full border-collapse text-[14px]">
                              <thead>
                                <tr className="bg-slate-50 border-b-[2px] border-slate-400">
                                  <th className="text-left px-4 py-2.5 font-bold text-slate-800 border-r border-slate-400" style={{ width: '50%' }}>Item Description</th>
                                  <th className="text-center px-3 py-2.5 font-bold text-slate-800 border-r border-slate-400" style={{ width: '10%' }}>Qty</th>
                                  <th className="text-center px-3 py-2.5 font-bold text-slate-800 border-r border-slate-400" style={{ width: '18%' }}>Unit Price</th>
                                  <th className="text-center px-3 py-2.5 font-bold text-slate-800" style={{ width: '22%' }}>Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {qEditing.items.map((it, idx) => (
                                  <tr key={idx} className="border-b border-slate-300">
                                    <td className="px-4 py-3 text-blue-900 font-semibold border-r border-slate-300">{it.item}</td>
                                    <td className="text-center px-3 py-3 text-blue-900 font-semibold border-r border-slate-300">{it.qty}</td>
                                    <td className="text-center px-3 py-3 text-blue-900 font-semibold border-r border-slate-300">{Number(it.price).toLocaleString()}</td>
                                    <td className="text-center px-3 py-3 text-blue-900 font-bold">{(it.qty * it.price).toLocaleString()}</td>
                                  </tr>
                                ))}
                                {/* Empty rows to fill space like the physical form */}
                                {Array.from({ length: Math.max(0, 6 - qEditing.items.length) }).map((_, idx) => (
                                  <tr key={`empty-${idx}`} className="border-b border-slate-300">
                                    <td className="px-4 py-3 border-r border-slate-300">&nbsp;</td>
                                    <td className="px-3 py-3 border-r border-slate-300">&nbsp;</td>
                                    <td className="px-3 py-3 border-r border-slate-300">&nbsp;</td>
                                    <td className="px-3 py-3">&nbsp;</td>
                                  </tr>
                                ))}
                                {/* Total Row */}
                                <tr className="border-t-[2px] border-slate-400 bg-slate-50">
                                  <td colSpan={3} className="px-4 py-3 text-right font-bold text-slate-800 text-[15px] border-r border-slate-400">TOTAL</td>
                                  <td className="text-center px-3 py-3 text-red-600 font-black text-lg">
                                    {qEditing.items.reduce((sum, it) => sum + (it.qty * it.price), 0).toLocaleString()}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          {/* Signature Section */}
                          <div className="mt-6 flex justify-between items-end text-[14px]">
                            <div>
                              <span className="font-bold text-slate-700 text-[13px]">E&OE</span>
                              <div className="flex gap-2 items-end mt-2">
                                <span className="font-bold text-slate-800">Signature:</span>
                                <span className="border-b-[1.5px] border-dotted border-slate-400 min-w-[180px] inline-block pb-0.5"></span>
                              </div>
                              <div className="text-[12px] text-slate-500 mt-1 font-semibold">FOR: FUEGO</div>
                            </div>
                            <div>
                              <div className="flex gap-2 items-end">
                                <span className="font-bold text-slate-800">Received by:</span>
                                <span className="border-b-[1.5px] border-dotted border-slate-400 min-w-[180px] inline-block pb-0.5"></span>
                              </div>
                              <div className="flex gap-2 items-end mt-2">
                                <span className="font-bold text-slate-800">Signature:</span>
                                <span className="border-b-[1.5px] border-dotted border-slate-400 min-w-[180px] inline-block pb-0.5"></span>
                              </div>
                            </div>
                          </div>

                          {/* Terms & Conditions Footer */}
                          <div className="mt-6 border-t border-slate-300 pt-3">
                            <div className="bg-red-600 text-white text-[10px] font-bold px-3 py-1 inline-block rounded-sm mb-2 tracking-wide">
                              TERMS & CONDITIONS
                            </div>
                            <ol className="text-[10px] text-slate-600 leading-relaxed list-decimal pl-5 space-y-0.5">
                              <li>Outstanding balances (after 30 days by customer upon notice) to the nonfinisment of work. The remaining balance is due upon delivery.</li>
                              <li>An initial payment of 50% of the total project cost is required prior to the commencement of work.</li>
                              <li>20% is due upon complete project handover.</li>
                              <li>For any customized project where full amount or 10% deposit will be required, a storage and balancing fee of a percentage will on depend on the date of completion with an agreement.</li>
                              <li>Products that remain uncollected for a period exceeding 30 days from the appropriate law enforcement authorities may be disposed.</li>
                            </ol>
                          </div>

                          {/* Fuego Watermark */}
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.08]">
                            <FuegoLogo scale={4} />
                          </div>
                        </div>
                      ) : (
                        <div id="printable" className="bg-white text-slate-800 p-8 shadow-sm flex flex-col mx-auto w-full max-w-[800px] border border-slate-200 min-h-[600px] relative">
                          {/* Header */}
                          <div className="flex justify-between items-start">
                            <div>
                              <h1 className="text-4xl font-bold text-[#2A3457] mb-2 font-sans tracking-tight">Receipt</h1>
                              <div className="text-[13px] text-slate-800 leading-tight font-medium">
                                Phone: 0760033623 / 0788837621<br/>
                                Whatsapp: 0707 635706<br/>
                                P.O. Box, 113108 Wakiso<br/>
                                fuegouganda@gmail.com
                              </div>
                            </div>
                            <div className="pt-2 pr-4">
                              <FuegoLogo scale={1.2} />
                            </div>
                          </div>
                          
                          {/* Banner */}
                          <div className="mt-4 bg-[#2A3457] text-white py-1 px-4 text-base font-bold flex">
                            Create | Reinvent | Inspire
                          </div>
                          
                          {/* Details */}
                          <div className="mt-8 flex flex-col gap-6 text-[15px]">
                            <div className="flex justify-between items-end">
                              <div className="flex gap-2 items-end">
                                <span className="font-bold text-slate-800 text-lg">No.</span>
                                <span className="text-red-500 font-bold text-xl border-b-[1.5px] border-dotted border-slate-500 pb-0.5 px-4 min-w-[120px] inline-block">{qEditing.id.replace('RC-', '')}</span>
                              </div>
                              <div className="flex gap-2 items-end">
                                <span className="font-bold text-slate-800">Date:</span>
                                <span className="border-b-[1.5px] border-dotted border-slate-500 pb-0.5 px-2 min-w-[200px] inline-block text-center text-blue-900 font-semibold">{qEditing.date ? qEditing.date.split('T')[0] : ''}</span>
                              </div>
                            </div>
                            
                            <div className="flex gap-2 items-end w-full">
                              <span className="font-bold text-slate-800 whitespace-nowrap">Received with thanks from:</span>
                              <span className="border-b-[1.5px] border-dotted border-slate-500 pb-0.5 flex-1 text-blue-900 font-semibold px-4 uppercase tracking-wide">
                                {qEditing.customer}
                              </span>
                            </div>
                            {qEditing.phone && (
                              <div className="flex gap-2 items-end w-full">
                                <span className="font-bold text-slate-800 whitespace-nowrap">Phone:</span>
                                <span className="border-b-[1.5px] border-dotted border-slate-500 pb-0.5 flex-1 text-blue-900 font-semibold px-4">
                                  {qEditing.phone}
                                </span>
                              </div>
                            )}
                            
                            <div className="flex gap-2 items-end w-full">
                              <span className="font-bold text-slate-800 whitespace-nowrap">The sum of Shillings:</span>
                              <span className="border-b-[1.5px] border-dotted border-slate-500 pb-0.5 flex-1 text-blue-900 font-semibold px-4 uppercase">
                              </span>
                            </div>
                            
                            <div className="flex gap-2 items-end w-full">
                              <span className="font-bold text-slate-800 whitespace-nowrap">Being payment for:</span>
                              <span className="border-b-[1.5px] border-dotted border-slate-500 pb-0.5 flex-1 text-blue-900 font-semibold px-4 uppercase">
                                {qEditing.items.map(i => `${i.qty > 1 ? i.qty + 'x ' : ''}${i.item}`).join(', ')}
                              </span>
                            </div>
                            
                            <div className="flex justify-between items-end mt-2">
                              <div className="flex gap-2 items-end">
                                <span className="font-bold text-slate-800">Cash / Cheque No.</span>
                                <span className="border-b-[1.5px] border-dotted border-slate-500 pb-0.5 px-4 min-w-[200px] inline-block text-center text-blue-900 font-semibold">Mobile money</span>
                              </div>
                              <div className="flex gap-2 items-end">
                                <span className="font-bold text-slate-800">Balance:</span>
                                <span className="border-b-[1.5px] border-dotted border-slate-500 pb-0.5 px-2 min-w-[150px] inline-block text-center text-blue-900 font-semibold">
                                  {(() => {
                                    const sub = getItemTotal(qEditing.items || []);
                                    const paid = Number(qEditing.amount_paid || 0);
                                    const bal = sub - paid;
                                    return bal > 0 ? `UGX ${bal.toLocaleString()}` : 'NIL';
                                  })()}
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          {/* Footer section */}
                          <div className="mt-12 flex justify-between items-end pb-12">
                            <div className="flex items-center gap-3">
                              <span className="text-2xl font-bold text-slate-800">SHS</span>
                              <div className="border-[2px] border-[#2A3457] rounded-xl px-6 py-2 text-2xl font-semibold text-blue-900 min-w-[200px] bg-slate-50 text-center">
                                {qEditing.items.reduce((s, it) => s + (it.qty * it.price), 0).toLocaleString()}
                              </div>
                            </div>

                            <div className="flex flex-col gap-2 items-end">
                              <div className="flex gap-2 items-end">
                                <span className="font-bold text-sm text-slate-800">Signed</span>
                                <span className="border-b-[1.5px] border-dotted border-slate-500 min-w-[180px] inline-block"></span>
                              </div>
                              <div className="font-bold text-[13px] text-slate-800 text-right">FUEGO Uganda Limited</div>
                            </div>
                          </div>

                          <div className="absolute bottom-6 left-8 right-8">
                            <div className="mx-auto max-w-[620px] border-t border-slate-300 pt-3">
                              <div className="text-center text-[10px] font-bold text-slate-700 uppercase tracking-[0.2em] mb-1.5">
                                All rights reserved for FUEGO Uganda Limited
                              </div>
                              <div className="text-center text-[10px] text-slate-600 font-medium leading-relaxed">
                                fuegouganda@gmail.com &nbsp; • &nbsp; Phone: 0760033623 / 0788837621
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  </div>
                )}
              </div>
            )}

            {/* Tab: Accounting */}
            {activeTab === 'accounting' && (
              <div className="flex flex-col gap-lg">
                {/* Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-5 bg-surface-container-lowest rounded-xl border border-outline-variant/60 shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-bold tracking-wider">Net Balance</span>
                      <span className="material-symbols-outlined text-blue-500" style={{ fontVariationSettings: "'FILL' 1" }}>account_balance_wallet</span>
                    </div>
                    <div className={`font-headline-lg text-headline-lg font-black ${expenses.reduce((sum, e) => sum + (e.type === 'income' ? Number(e.amount) : -Number(e.amount)), 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      UGX {expenses.reduce((sum, e) => sum + (e.type === 'income' ? Number(e.amount) : -Number(e.amount)), 0).toLocaleString()}
                    </div>
                  </div>
                  <div className="p-5 bg-surface-container-lowest rounded-xl border border-outline-variant/60 shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-bold tracking-wider">Income (Sales)</span>
                      <span className="material-symbols-outlined text-green-500" style={{ fontVariationSettings: "'FILL' 1" }}>trending_up</span>
                    </div>
                    <div className="font-headline-lg text-headline-lg text-green-600 font-black">
                      UGX {expenses.filter(e => e.type === 'income').reduce((sum, e) => sum + Number(e.amount), 0).toLocaleString()}
                    </div>
                  </div>
                  <div className="p-5 bg-surface-container-lowest rounded-xl border border-outline-variant/60 shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-bold tracking-wider">Expenses</span>
                      <span className="material-symbols-outlined text-red-500" style={{ fontVariationSettings: "'FILL' 1" }}>trending_down</span>
                    </div>
                    <div className="font-headline-lg text-headline-lg text-red-600 font-black">
                      UGX {expenses.filter(e => e.type !== 'income').reduce((sum, e) => sum + Number(e.amount), 0).toLocaleString()}
                    </div>
                  </div>
                </div>

                {user?.role === 'admin' && (
                  <section className="overflow-hidden rounded-xl border border-outline-variant/60 bg-surface-container-lowest shadow-sm">
                    <div className="flex flex-col gap-3 border-b border-outline-variant/60 p-5 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="flex items-center gap-2 font-title-md text-title-md font-bold text-on-surface">
                          <span className="material-symbols-outlined text-secondary">monitoring</span>
                          Monthly Performance
                        </h3>
                        <p className="mt-1 text-sm text-on-surface-variant">
                          Sales income minus recorded expenses and non-voided purchases, for the last six months.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={loadPerformance}
                        disabled={performanceLoading}
                        className="inline-flex h-10 items-center justify-center gap-1 rounded-lg px-3 font-semibold text-secondary hover:bg-surface-container disabled:opacity-50"
                      >
                        <span className="material-symbols-outlined text-[18px]">refresh</span>
                        Refresh
                      </button>
                    </div>
                    {performanceLoading && !performance ? (
                      <p className="p-5 text-sm text-on-surface-variant">Loading monthly performance...</p>
                    ) : performance ? (
                      <>
                        <div className="grid gap-4 border-b border-outline-variant/60 p-5 sm:grid-cols-2 lg:grid-cols-4">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Current month</p>
                            <p className="mt-1 font-semibold text-on-surface">
                              {new Date(`${performance.current.month}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Sales income</p>
                            <p className="mt-1 font-semibold text-green-700">UGX {Number(performance.current.revenue).toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Costs</p>
                            <p className="mt-1 font-semibold text-red-700">UGX {Number(performance.current.costs).toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Net</p>
                            <p className={`mt-1 font-semibold ${Number(performance.current.net) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                              UGX {Number(performance.current.net).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className={`flex items-start gap-3 border-b border-outline-variant/60 px-5 py-4 ${
                          performance.current.status === 'profit' ? 'bg-emerald-50 text-emerald-900' :
                          performance.current.status === 'promising' ? 'bg-amber-50 text-amber-900' :
                          'bg-red-50 text-red-900'
                        }`}>
                          <span className="material-symbols-outlined">
                            {performance.current.status === 'profit' ? 'check_circle' : performance.current.status === 'promising' ? 'trending_up' : 'warning'}
                          </span>
                          <div>
                            <p className="font-semibold capitalize">{performance.current.status}</p>
                            <p className="mt-0.5 text-sm">{performance.current.message}</p>
                          </div>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm">
                            <thead className="bg-surface-container-low/50 text-xs uppercase tracking-wide text-on-surface-variant">
                              <tr>
                                <th className="px-5 py-3 font-semibold">Month</th>
                                <th className="px-5 py-3 text-right font-semibold">Sales income</th>
                                <th className="px-5 py-3 text-right font-semibold">Purchases</th>
                                <th className="px-5 py-3 text-right font-semibold">Expenses</th>
                                <th className="px-5 py-3 text-right font-semibold">Net</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-outline-variant/40">
                              {performance.months.map((month) => (
                                <tr key={month.month} className={month.month === performance.current.month ? 'bg-surface-container-low/50' : ''}>
                                  <td className="whitespace-nowrap px-5 py-3 font-medium text-on-surface">
                                    {new Date(`${month.month}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                                  </td>
                                  <td className="whitespace-nowrap px-5 py-3 text-right text-green-700">UGX {Number(month.revenue).toLocaleString()}</td>
                                  <td className="whitespace-nowrap px-5 py-3 text-right text-on-surface-variant">UGX {Number(month.purchases).toLocaleString()}</td>
                                  <td className="whitespace-nowrap px-5 py-3 text-right text-on-surface-variant">UGX {Number(month.expenses).toLocaleString()}</td>
                                  <td className={`whitespace-nowrap px-5 py-3 text-right font-semibold ${Number(month.net) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                    UGX {Number(month.net).toLocaleString()}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : (
                      <p className="p-5 text-sm text-on-surface-variant">Monthly performance is not available.</p>
                    )}
                  </section>
                )}

                {/* Add Expense Form - Admin Only */}
                {user?.role === 'admin' && (
                <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl p-5 shadow-sm">
                  <h3 className="font-title-md text-title-md font-bold text-on-surface mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-secondary">add_circle</span>
                    Record Expense
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
                    <div>
                      <label className="block font-label-sm text-label-sm text-outline mb-1">Category</label>
                      <select 
                        value={expCategory} 
                        onChange={e => setExpCategory(e.target.value)}
                        className="w-full h-11 px-3 border border-outline-variant rounded-lg font-body-md text-body-md text-on-surface bg-surface-container-lowest focus:ring-1 focus:ring-secondary outline-none capitalize"
                      >
                        {EXPENSE_CATEGORIES.map(cat => (
                          <option key={cat} value={cat} className="capitalize">{cat}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-label-sm text-label-sm text-outline mb-1">Amount (UGX)</label>
                      <input 
                        type="number" 
                        value={expAmount} 
                        onChange={e => setExpAmount(e.target.value)}
                        placeholder="e.g. 50000"
                        className="w-full h-11 px-3 border border-outline-variant rounded-lg font-body-md text-body-md text-on-surface bg-surface-container-lowest focus:ring-1 focus:ring-secondary outline-none font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-label-sm text-label-sm text-outline mb-1">Description</label>
                      <input 
                        type="text" 
                        value={expDescription} 
                        onChange={e => setExpDescription(e.target.value)}
                        placeholder="e.g. Fuel for delivery"
                        className="w-full h-11 px-3 border border-outline-variant rounded-lg font-body-md text-body-md text-on-surface bg-surface-container-lowest focus:ring-1 focus:ring-secondary outline-none"
                      />
                    </div>
                    <button 
                      onClick={async () => {
                        if (!expAmount || Number(expAmount) <= 0) {
                          setErrorMsg('Please enter a valid amount.');
                          setTimeout(() => setErrorMsg(''), 3000);
                          return;
                        }
                        try {
                          await axios.post('http://localhost:5000/api/expenses', {
                            branch_id: Number(branchId),
                            category: expCategory,
                            description: expDescription,
                            amount: Number(expAmount),
                            date: date
                          });
                          setMessage('Expense recorded successfully!');
                          setExpAmount('');
                          setExpDescription('');
                          loadExpenses();
                          setTimeout(() => setMessage(''), 3000);
                        } catch (err) {
                          console.error(err);
                          setErrorMsg('Failed to save expense.');
                          setTimeout(() => setErrorMsg(''), 3000);
                        }
                      }}
                      className="h-11 flex items-center justify-center gap-2 px-6 rounded-lg bg-secondary text-white font-label-md text-label-md font-semibold hover:bg-secondary/90 transition-all shadow-sm"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>save</span>
                      Save
                    </button>
                  </div>
                </div>
                )}

                {/* Expenses History Table */}
                <div className="bg-surface-container-lowest border border-outline-variant/60 rounded-xl shadow-sm overflow-hidden">
                  <div className="p-5 border-b border-outline-variant/60">
                    <h3 className="font-title-md text-title-md font-bold text-on-surface flex items-center gap-2">
                      <span className="material-symbols-outlined text-secondary">history</span>
                      Expense History — {new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </h3>
                  </div>
                  {expenses.length === 0 ? (
                    <div className="p-10 text-center text-on-surface-variant">
                      <span className="material-symbols-outlined text-4xl mb-2 block opacity-40">receipt_long</span>
                      <p className="font-body-md">No expenses recorded for this date.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-surface-container-low/50">
                            <th className="px-5 py-3 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Category</th>
                            <th className="px-5 py-3 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">Description</th>
                            <th className="px-5 py-3 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider text-right">Amount</th>
                            <th className="px-5 py-3 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">By</th>
                            {user?.role === 'admin' && (
                              <th className="px-5 py-3 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider text-center">Action</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {expenses.map((exp) => (
                            <tr key={exp.id} className={`border-t border-outline-variant/40 hover:bg-surface-container-low/30 transition-colors ${exp.type === 'income' ? 'bg-green-50/30' : ''}`}>
                              <td className="px-5 py-3.5">
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${
                                  exp.type === 'income' ? 'bg-green-100 text-green-800' :
                                  exp.category === 'rent' ? 'bg-purple-100 text-purple-700' : 
                                  exp.category === 'transport' ? 'bg-blue-100 text-blue-700' : 
                                  exp.category === 'salaries' ? 'bg-amber-100 text-amber-700' : 
                                  exp.category === 'utilities' ? 'bg-yellow-100 text-yellow-700' : 
                                  exp.category === 'stock purchase' ? 'bg-red-100 text-red-700' : 
                                  'bg-slate-100 text-slate-700'
                                }`}>
                                  {exp.type === 'income' ? <span className="material-symbols-outlined text-[14px]">trending_up</span> : null}
                                  {exp.category}
                                </span>
                              </td>
                              <td className="px-5 py-3.5 font-body-md text-on-surface">{exp.description || '—'}</td>
                              <td className={`px-5 py-3.5 font-mono font-semibold text-right ${exp.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                                {exp.type === 'income' ? '+' : '-'} UGX {Number(exp.amount).toLocaleString()}
                              </td>
                              <td className="px-5 py-3.5 font-body-sm text-on-surface-variant">{exp.created_by_name || '—'}</td>
                              {user?.role === 'admin' && (
                              <td className="px-5 py-3.5 text-center">
                                <button 
                                  onClick={async () => {
                                    if (window.confirm('Delete this record?')) {
                                      try {
                                        await axios.delete(`http://localhost:5000/api/expenses/${exp.id}`);
                                        setMessage('Record deleted.');
                                        loadExpenses();
                                        setTimeout(() => setMessage(''), 3000);
                                      } catch (err) {
                                        setErrorMsg('Failed to delete record.');
                                        setTimeout(() => setErrorMsg(''), 3000);
                                      }
                                    }
                                  }}
                                  className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors"
                                  title="Delete record"
                                >
                                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>delete</span>
                                </button>
                              </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-outline-variant bg-surface-container-low/30">
                            <td className="px-5 py-3 font-label-md text-label-md font-bold text-on-surface" colSpan="2">Net Total</td>
                            <td className={`px-5 py-3 font-mono font-bold text-right text-lg ${expenses.reduce((s, e) => s + (e.type === 'income' ? Number(e.amount) : -Number(e.amount)), 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                              UGX {expenses.reduce((s, e) => s + (e.type === 'income' ? Number(e.amount) : -Number(e.amount)), 0).toLocaleString()}
                            </td>
                            <td colSpan="2"></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>

                {user?.role === 'admin' && (
                  <>
                    <form onSubmit={handleRecordPurchase} className="rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-sm">
                      <div className="mb-4">
                        <h3 className="flex items-center gap-2 font-title-md text-title-md font-bold text-on-surface">
                          <span className="material-symbols-outlined text-secondary">shopping_cart</span>
                          Record Purchase
                        </h3>
                        <p className="mt-1 text-sm text-on-surface-variant">Record material purchases or stock purchases for this branch.</p>
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                          <label htmlFor="purchase-item" className="mb-1 block text-sm font-medium text-on-surface-variant">Item</label>
                          <input
                            id="purchase-item"
                            type="text"
                            value={purchaseForm.item_name}
                            onChange={(e) => setPurchaseForm({ ...purchaseForm, item_name: e.target.value })}
                            maxLength={150}
                            required
                            className="h-11 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-on-surface outline-none focus:ring-1 focus:ring-secondary"
                            placeholder="e.g. Steel sheets"
                          />
                        </div>
                        <div>
                          <label htmlFor="purchase-category" className="mb-1 block text-sm font-medium text-on-surface-variant">Category</label>
                          <select
                            id="purchase-category"
                            value={purchaseForm.category}
                            onChange={(e) => setPurchaseForm({ ...purchaseForm, category: e.target.value })}
                            className="h-11 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-on-surface outline-none focus:ring-1 focus:ring-secondary"
                          >
                            <option value="material">Material</option>
                            <option value="stock">Stock</option>
                          </select>
                        </div>
                        <div>
                          <label htmlFor="purchase-quantity" className="mb-1 block text-sm font-medium text-on-surface-variant">Quantity</label>
                          <input
                            id="purchase-quantity"
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={purchaseForm.quantity}
                            onChange={(e) => setPurchaseForm({ ...purchaseForm, quantity: e.target.value })}
                            required
                            className="h-11 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-on-surface outline-none focus:ring-1 focus:ring-secondary"
                          />
                        </div>
                        <div>
                          <label htmlFor="purchase-unit-cost" className="mb-1 block text-sm font-medium text-on-surface-variant">Unit cost (UGX)</label>
                          <input
                            id="purchase-unit-cost"
                            type="number"
                            min="0"
                            step="0.01"
                            value={purchaseForm.unit_cost}
                            onChange={(e) => setPurchaseForm({ ...purchaseForm, unit_cost: e.target.value })}
                            required
                            className="h-11 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-on-surface outline-none focus:ring-1 focus:ring-secondary"
                          />
                        </div>
                        <div>
                          <label htmlFor="purchase-supplier" className="mb-1 block text-sm font-medium text-on-surface-variant">Supplier</label>
                          <input
                            id="purchase-supplier"
                            type="text"
                            value={purchaseForm.supplier}
                            onChange={(e) => setPurchaseForm({ ...purchaseForm, supplier: e.target.value })}
                            maxLength={150}
                            className="h-11 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-on-surface outline-none focus:ring-1 focus:ring-secondary"
                          />
                        </div>
                        <div>
                          <label htmlFor="purchase-date" className="mb-1 block text-sm font-medium text-on-surface-variant">Purchase date</label>
                          <input
                            id="purchase-date"
                            type="date"
                            value={purchaseForm.purchase_date}
                            onChange={(e) => setPurchaseForm({ ...purchaseForm, purchase_date: e.target.value })}
                            required
                            className="h-11 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-on-surface outline-none focus:ring-1 focus:ring-secondary"
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label htmlFor="purchase-notes" className="mb-1 block text-sm font-medium text-on-surface-variant">Notes</label>
                          <input
                            id="purchase-notes"
                            type="text"
                            value={purchaseForm.notes}
                            onChange={(e) => setPurchaseForm({ ...purchaseForm, notes: e.target.value })}
                            className="h-11 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-on-surface outline-none focus:ring-1 focus:ring-secondary"
                          />
                        </div>
                      </div>
                      <div className="mt-4 flex justify-end">
                        <button
                          type="submit"
                          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-secondary px-5 font-semibold text-white shadow-sm transition-colors hover:bg-secondary/90"
                        >
                          <span className="material-symbols-outlined text-[18px]">save</span>
                          Save Purchase
                        </button>
                      </div>
                    </form>

                    <section className="overflow-hidden rounded-xl border border-outline-variant/60 bg-surface-container-lowest shadow-sm">
                      <div className="flex flex-col gap-3 border-b border-outline-variant/60 p-5 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="flex items-center gap-2 font-title-md text-title-md font-bold text-on-surface">
                            <span className="material-symbols-outlined text-secondary">history</span>
                            Purchase History
                          </h3>
                          <p className="mt-1 text-sm text-on-surface-variant">
                            Active total: UGX {purchases.filter((purchase) => !purchase.voided).reduce((sum, purchase) => sum + Number(purchase.total_cost || 0), 0).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <label htmlFor="purchase-month" className="text-sm font-medium text-on-surface-variant">Month</label>
                          <input
                            id="purchase-month"
                            type="month"
                            value={purchaseMonth}
                            onChange={(e) => setPurchaseMonth(e.target.value)}
                            className="h-10 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 text-on-surface outline-none focus:ring-1 focus:ring-secondary"
                          />
                          <button
                            type="button"
                            onClick={loadPurchases}
                            disabled={purchasesLoading}
                            className="inline-flex h-10 items-center gap-1 rounded-lg px-3 font-semibold text-secondary hover:bg-surface-container disabled:opacity-50"
                          >
                            <span className="material-symbols-outlined text-[18px]">refresh</span>
                            Refresh
                          </button>
                        </div>
                      </div>
                      {purchasesLoading ? (
                        <p className="p-6 text-sm text-on-surface-variant">Loading purchases...</p>
                      ) : purchases.length === 0 ? (
                        <p className="p-6 text-sm text-on-surface-variant">No purchases recorded for this branch and month.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm">
                            <thead className="bg-surface-container-low/50 text-xs uppercase tracking-wide text-on-surface-variant">
                              <tr>
                                <th className="px-4 py-3 font-semibold">Date</th>
                                <th className="px-4 py-3 font-semibold">Item</th>
                                <th className="px-4 py-3 font-semibold">Category</th>
                                <th className="px-4 py-3 text-right font-semibold">Qty</th>
                                <th className="px-4 py-3 text-right font-semibold">Unit cost</th>
                                <th className="px-4 py-3 text-right font-semibold">Total</th>
                                <th className="px-4 py-3 font-semibold">Supplier / notes</th>
                                <th className="px-4 py-3 font-semibold">By</th>
                                <th className="px-4 py-3 font-semibold">Status</th>
                                <th className="px-4 py-3 text-center font-semibold">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-outline-variant/40">
                              {purchases.map((purchase) => (
                                <tr key={purchase.id} className={purchase.voided ? 'bg-surface-container-low/60 text-on-surface-variant/70' : 'text-on-surface'}>
                                  <td className="whitespace-nowrap px-4 py-3">{new Date(`${purchase.purchase_date}T00:00:00`).toLocaleDateString()}</td>
                                  <td className={`px-4 py-3 font-medium ${purchase.voided ? 'line-through' : ''}`}>{purchase.item_name}</td>
                                  <td className="px-4 py-3 capitalize">{purchase.category}</td>
                                  <td className="px-4 py-3 text-right">{Number(purchase.quantity).toLocaleString()}</td>
                                  <td className="whitespace-nowrap px-4 py-3 text-right">UGX {Number(purchase.unit_cost).toLocaleString()}</td>
                                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">UGX {Number(purchase.total_cost).toLocaleString()}</td>
                                  <td className="px-4 py-3">{[purchase.supplier, purchase.notes].filter(Boolean).join(' · ') || '—'}</td>
                                  <td className="px-4 py-3">{purchase.created_by_name || '—'}</td>
                                  <td className="px-4 py-3">
                                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${purchase.voided ? 'bg-slate-200 text-slate-700' : 'bg-emerald-100 text-emerald-800'}`}>
                                      {purchase.voided ? 'Voided' : 'Recorded'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    {!purchase.voided && (
                                      <button
                                        type="button"
                                        onClick={() => handleVoidPurchase(purchase)}
                                        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                                        title="Void purchase and keep it in history"
                                      >
                                        Void
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </section>
                  </>
                )}
              </div>
            )}

            {activeTab === 'users' && user?.role === 'admin' && (
              <div className="flex flex-col gap-6 pb-10">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900 dark:text-white">User management</h1>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Create staff and administrator accounts for your branches.</p>
                </div>

                <form onSubmit={handleCreateUser} className="grid gap-4 rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-5 shadow-sm md:grid-cols-2">
                  <div>
                    <label htmlFor="user-name" className="mb-1 block text-sm font-medium text-on-surface-variant">Name</label>
                    <input
                      id="user-name"
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-on-surface outline-none focus:ring-2 focus:ring-secondary"
                      autoComplete="name"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="user-username" className="mb-1 block text-sm font-medium text-on-surface-variant">Username</label>
                    <input
                      id="user-username"
                      type="text"
                      value={form.username}
                      onChange={(e) => setForm({ ...form, username: e.target.value })}
                      className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-on-surface outline-none focus:ring-2 focus:ring-secondary"
                      autoComplete="username"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="user-password" className="mb-1 block text-sm font-medium text-on-surface-variant">Password (at least 6 characters)</label>
                    <input
                      id="user-password"
                      type="password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-on-surface outline-none focus:ring-2 focus:ring-secondary"
                      autoComplete="new-password"
                      minLength={6}
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="user-role" className="mb-1 block text-sm font-medium text-on-surface-variant">Role</label>
                    <select
                      id="user-role"
                      value={form.role}
                      onChange={(e) => setForm({ ...form, role: e.target.value })}
                      className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-on-surface outline-none focus:ring-2 focus:ring-secondary"
                    >
                      <option value="staff">Staff</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="user-branch" className="mb-1 block text-sm font-medium text-on-surface-variant">Branch</label>
                    <select
                      id="user-branch"
                      value={form.branch_id}
                      onChange={(e) => setForm({ ...form, branch_id: Number(e.target.value) })}
                      className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-on-surface outline-none focus:ring-2 focus:ring-secondary"
                    >
                      <option value={1}>Branch 1 (Kira)</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button
                      type="submit"
                      className="inline-flex items-center gap-2 rounded-lg bg-secondary px-5 py-2.5 font-semibold text-white transition-colors hover:bg-secondary/90"
                    >
                      <span className="material-symbols-outlined text-[18px]">person_add</span>
                      Create user
                    </button>
                  </div>
                </form>

                {editingUser && userEditForm && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <form onSubmit={handleUpdateUser} className="w-full max-w-xl rounded-xl bg-surface-container-lowest p-6 shadow-xl">
                      <div className="mb-5 flex items-center justify-between">
                        <div>
                          <h2 className="text-lg font-semibold text-on-surface">Edit account</h2>
                          <p className="text-sm text-on-surface-variant">{editingUser.username}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => { setEditingUser(null); setUserEditForm(null); }}
                          className="rounded-lg p-2 text-on-surface-variant hover:bg-surface-container"
                          aria-label="Close edit form"
                        >
                          <span className="material-symbols-outlined">close</span>
                        </button>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="text-sm font-medium text-on-surface-variant">
                          Name
                          <input
                            required
                            value={userEditForm.name}
                            onChange={(event) => setUserEditForm({ ...userEditForm, name: event.target.value })}
                            className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-on-surface"
                          />
                        </label>
                        <label className="text-sm font-medium text-on-surface-variant">
                          Username
                          <input
                            required
                            value={userEditForm.username}
                            onChange={(event) => setUserEditForm({ ...userEditForm, username: event.target.value })}
                            className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-on-surface"
                          />
                        </label>
                        <label className="text-sm font-medium text-on-surface-variant">
                          Role
                          <select
                            value={userEditForm.role}
                            disabled={Number(user?.id) === Number(editingUser.id)}
                            onChange={(event) => setUserEditForm({ ...userEditForm, role: event.target.value })}
                            className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-on-surface disabled:opacity-60"
                          >
                            <option value="staff">Staff</option>
                            <option value="admin">Admin</option>
                          </select>
                        </label>
                        <label className="text-sm font-medium text-on-surface-variant">
                          Branch
                          <select
                            value={userEditForm.branch_id}
                            onChange={(event) => setUserEditForm({ ...userEditForm, branch_id: Number(event.target.value) })}
                            className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-on-surface"
                          >
                            <option value={1}>Branch 1 (Kira)</option>
                          </select>
                        </label>
                        <label className="text-sm font-medium text-on-surface-variant sm:col-span-2">
                          New password (leave blank to keep current password)
                          <input
                            type="password"
                            minLength={6}
                            autoComplete="new-password"
                            value={userEditForm.password}
                            onChange={(event) => setUserEditForm({ ...userEditForm, password: event.target.value })}
                            className="mt-1 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-on-surface"
                          />
                        </label>
                      </div>
                      <div className="mt-6 flex justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => { setEditingUser(null); setUserEditForm(null); }}
                          className="rounded-lg border border-outline-variant px-4 py-2 font-semibold text-on-surface-variant"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={savingUser}
                          className="rounded-lg bg-secondary px-4 py-2 font-semibold text-white disabled:opacity-50"
                        >
                          {savingUser ? 'Saving...' : 'Save changes'}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                <section className="overflow-hidden rounded-xl border border-outline-variant/60 bg-surface-container-lowest shadow-sm">
                  <div className="flex items-center justify-between border-b border-outline-variant/60 px-5 py-4">
                    <h2 className="font-semibold text-on-surface">Users</h2>
                    <button
                      type="button"
                      onClick={loadUsers}
                      disabled={usersLoading}
                      className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-secondary hover:bg-surface-container disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[17px]">refresh</span>
                      Refresh
                    </button>
                  </div>
                  {usersLoading ? (
                    <p className="p-5 text-sm text-on-surface-variant">Loading users...</p>
                  ) : users.length === 0 ? (
                    <p className="p-5 text-sm text-on-surface-variant">No users found.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-surface-container-low text-xs uppercase tracking-wide text-on-surface-variant">
                          <tr>
                            <th className="px-5 py-3 font-semibold">Photo</th>
                            <th className="px-5 py-3 font-semibold">Name</th>
                            <th className="px-5 py-3 font-semibold">Username</th>
                            <th className="px-5 py-3 font-semibold">Role</th>
                            <th className="px-5 py-3 font-semibold">Branch</th>
                            <th className="px-5 py-3 font-semibold">Status</th>
                            <th className="px-5 py-3 font-semibold">Last login</th>
                            <th className="px-5 py-3 font-semibold">Login history</th>
                            <th className="px-5 py-3 font-semibold">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-outline-variant/60">
                          {users.map((listedUser) => (
                            <React.Fragment key={listedUser.id}>
                              <tr>
                                <td className="px-5 py-3">
                                  <div className="flex items-center gap-2">
                                    {listedUser.profile_photo_url ? (
                                      <img
                                        src={`http://localhost:5000${listedUser.profile_photo_url}`}
                                        alt={`${listedUser.name} profile`}
                                        className="h-10 w-10 rounded-full border border-outline-variant object-cover"
                                      />
                                    ) : (
                                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container text-on-surface-variant">
                                        <span className="material-symbols-outlined">person</span>
                                      </div>
                                    )}
                                    <label className="cursor-pointer whitespace-nowrap rounded-lg border border-outline-variant px-2.5 py-1.5 text-xs font-semibold text-secondary hover:bg-surface-container">
                                      {photoUploadingId === listedUser.id ? 'Uploading...' : listedUser.profile_photo_url ? 'Change' : 'Add photo'}
                                      <input
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp"
                                        disabled={photoUploadingId === listedUser.id}
                                        className="hidden"
                                        onChange={(event) => {
                                          const file = event.target.files?.[0];
                                          if (file) handleUserPhotoUpload(listedUser.id, file);
                                          event.target.value = '';
                                        }}
                                      />
                                    </label>
                                  </div>
                                </td>
                                <td className="px-5 py-3 font-medium text-on-surface">{listedUser.name}</td>
                                <td className="px-5 py-3 text-on-surface-variant">{listedUser.username}</td>
                                <td className="px-5 py-3 capitalize text-on-surface-variant">{listedUser.role}</td>
                                <td className="px-5 py-3 text-on-surface-variant">{Number(listedUser.branch_id) === 1 ? 'Branch 1 (Kira)' : `Branch ${listedUser.branch_id ?? '—'}`}</td>
                                <td className="px-5 py-3 text-on-surface-variant">{listedUser.active ? 'Active' : 'Inactive'}</td>
                                <td className="px-5 py-3 text-on-surface-variant">
                                  {listedUser.last_login ? new Date(listedUser.last_login).toLocaleString() : 'Never'}
                                </td>
                                <td className="px-5 py-3">
                                  <div className="flex items-center gap-3 whitespace-nowrap">
                                    <span className="text-on-surface-variant">{Number(listedUser.login_count || 0)} times</span>
                                    <button
                                      type="button"
                                      onClick={() => toggleLoginHistory(listedUser.id)}
                                      className="font-semibold text-secondary hover:underline"
                                    >
                                      {expandedLoginHistory === listedUser.id ? 'Hide dates' : 'View dates'}
                                    </button>
                                  </div>
                                </td>
                                <td className="px-5 py-3">
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() => openEditUser(listedUser)}
                                      className="rounded-md border border-outline-variant px-2.5 py-1.5 text-xs font-semibold text-secondary hover:bg-surface-container"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      disabled={Number(user?.id) === Number(listedUser.id) || changingUserStatus === listedUser.id}
                                      onClick={() => handleToggleUserStatus(listedUser)}
                                      className="rounded-md border border-outline-variant px-2.5 py-1.5 text-xs font-semibold text-on-surface-variant hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                      {changingUserStatus === listedUser.id ? 'Saving...' : listedUser.active ? 'Lock' : 'Unlock'}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={Number(user?.id) === Number(listedUser.id) || deletingUser === listedUser.id}
                                      onClick={() => handleDeleteUser(listedUser)}
                                      className="rounded-md border border-red-300 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                      {deletingUser === listedUser.id ? 'Deleting...' : 'Delete'}
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              {expandedLoginHistory === listedUser.id && (
                                <tr>
                                  <td colSpan={9} className="bg-surface-container-low px-5 py-4">
                                    {loginHistoryLoading === listedUser.id ? (
                                      <p className="text-sm text-on-surface-variant">Loading login history...</p>
                                    ) : loginHistory[listedUser.id]?.logins?.length ? (
                                      <div>
                                        <p className="mb-2 text-sm font-semibold text-on-surface">
                                          {loginHistory[listedUser.id].login_count} successful login(s)
                                          {Number(loginHistory[listedUser.id].login_count) > loginHistory[listedUser.id].logins.length
                                            ? ' — showing the most recent 100'
                                            : ''}
                                        </p>
                                        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                          {loginHistory[listedUser.id].logins.map((login, index) => (
                                            <li key={`${login.login_at}-${index}`} className="rounded-lg border border-outline-variant/60 bg-surface-container-lowest px-3 py-2 text-sm text-on-surface-variant">
                                              {new Date(login.login_at).toLocaleString()}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    ) : (
                                      <p className="text-sm text-on-surface-variant">No successful logins have been recorded yet.</p>
                                    )}
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* Tab: Analytics */}
            {activeTab === 'analytics' && (
              <div className="flex flex-col gap-lg">
                {/* Filters Section */}
                <section className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                  <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 px-4 py-2 rounded-lg shrink-0">
                    <span className="material-symbols-outlined text-[20px]">calendar_month</span>
                    <span className="text-xs font-semibold tracking-wide">{date}</span>
                  </div>
                  <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 px-4 py-2 rounded-lg shrink-0">
                    <span className="material-symbols-outlined text-[20px]">storefront</span>
                    <span className="text-xs font-semibold tracking-wide">Kira Store</span>
                  </div>
                </section>

                <section className="flex flex-wrap gap-2">
                  <button
                    onClick={exportDailyTransactionReport}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[14px]">download</span>
                    Daily CSV
                  </button>
                  <button
                    onClick={exportWeeklySalesReport}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[14px]">table_chart</span>
                    Weekly report
                  </button>
                  <button
                    onClick={exportMonthlySalesReport}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[14px]">summarize</span>
                    Monthly report
                  </button>
                </section>

                {/* Metric Summary */}
                <section className="grid grid-cols-2 gap-3">
                  <div className="bg-blue-600 text-white p-4 rounded-xl shadow-sm space-y-2 col-span-1">
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-semibold tracking-wider uppercase opacity-80">Total Volume</span>
                      <span className="text-[14px] font-bold text-green-300">Today</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-extrabold">{recentTransactions.filter(t => t.type === 'Sale').reduce((sum, t) => sum + Number(t.qty || 0), 0)}</span>
                      <span className="text-xs font-semibold tracking-wider opacity-70">Stoves</span>
                    </div>
                  </div>
                  <div className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-4 rounded-xl space-y-2 col-span-1">
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-semibold tracking-wider text-slate-500 dark:text-slate-400 uppercase">Revenue</span>
                      <span className="text-[14px] font-bold text-blue-600 dark:text-blue-400">Today</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-extrabold text-blue-600 dark:text-blue-400">{recentTransactions.filter(t => t.type === 'Sale').reduce((sum, t) => sum + Number(t.raw_price || 0), 0).toLocaleString()}</span>
                      <span className="text-xs font-semibold tracking-wider text-slate-500 dark:text-slate-400">UGX</span>
                    </div>
                  </div>
                </section>

                {/* Kira Store Summary */}
                <section className="grid grid-cols-2 gap-3">
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Stock on Hand</span>
                      <span className="material-symbols-outlined text-slate-500">inventory_2</span>
                    </div>
                    <p className="text-3xl font-extrabold text-slate-900 dark:text-white">{totalCurrentStock}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Stoves in Kira</p>
                  </div>
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Daily Sales</span>
                      <span className="material-symbols-outlined text-slate-500">sell</span>
                    </div>
                    <p className="text-3xl font-extrabold text-blue-600 dark:text-blue-400">{recentTransactions.filter(t => t.type === 'Sale').reduce((sum, t) => sum + Number(t.qty || 0), 0)}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Units sold today</p>
                  </div>
                </section>

                <section className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold">Sales Performance</h3>
                    <span className="material-symbols-outlined text-slate-500">bar_chart</span>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="font-semibold text-slate-800 dark:text-white">This Week</h4>
                        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">UGX</span>
                      </div>
                      <div className="flex items-end justify-between h-40 gap-2">
                        {salesWeekData.map((item) => (
                          <div key={item.label} className="flex flex-1 flex-col items-center gap-2 h-full justify-end">
                            <div
                              className="w-full rounded-t-xl bg-gradient-to-t from-blue-600 to-blue-400 shadow-sm"
                              style={{ height: `${Math.max(18, (item.value / Math.max(...salesWeekData.map(d => d.value), 1)) * 100)}%` }}
                            ></div>
                            <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">{item.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="font-semibold text-slate-800 dark:text-white">This Month</h4>
                        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">UGX</span>
                      </div>
                      <div className="flex items-end justify-between h-40 gap-2">
                        {salesMonthData.map((item) => (
                          <div key={item.label} className="flex flex-1 flex-col items-center gap-2 h-full justify-end">
                            <div
                              className="w-full rounded-t-xl bg-gradient-to-t from-green-600 to-emerald-400 shadow-sm"
                              style={{ height: `${Math.max(18, (item.value / Math.max(...salesMonthData.map(d => d.value), 1)) * 100)}%` }}
                            ></div>
                            <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">{item.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-lg font-bold">Sales Mix</h3>
                    <span className="material-symbols-outlined text-slate-500">pie_chart</span>
                  </div>

                  <div className="grid gap-6 md:grid-cols-[220px_1fr] items-center">
                    <div className="relative mx-auto flex h-44 w-44 items-center justify-center rounded-full shadow-inner" style={{ background: pieGradient }}>
                      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white dark:bg-slate-900 text-center shadow-sm">
                        <div>
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Profit</div>
                          <div className="text-sm font-extrabold text-slate-900 dark:text-white">UGX {Math.max(0, totalProfitToday).toLocaleString()}</div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {pieSegments.map((segment) => {
                        const share = Math.round((segment.value / pieTotal) * 100);
                        return (
                          <div key={segment.label} className="flex items-center justify-between gap-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-3">
                            <div className="flex items-center gap-3">
                              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: segment.color }}></span>
                              <div>
                                <p className="text-sm font-semibold text-slate-800 dark:text-white">{segment.label}</p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">{share}% of total</p>
                              </div>
                            </div>
                            <p className="text-sm font-bold text-slate-900 dark:text-white">UGX {segment.value.toLocaleString()}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </section>

                {/* Recent Transactions */}
                <section className="space-y-3 pb-8">
                  <div className="flex justify-between items-center px-1">
                    <h3 className="text-lg font-bold">Recent Transactions</h3>
                    <button onClick={() => setActiveTab('transaction')} className="text-blue-600 dark:text-blue-400 text-xs font-bold uppercase tracking-wider hover:underline">View All</button>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-200 dark:divide-slate-700 overflow-hidden">
                    {recentTransactions.slice(0, 3).map(tx => {
                      const icon = tx.type === 'Sale' ? 'shopping_cart' : tx.type === 'Received' ? 'local_shipping' : 'inventory_2';
                      const title = tx.type === 'Sale' ? 'Sale' : tx.type === 'Received' ? 'Stock Received' : 'Stock Adjusted';
                      return (
                        <div key={tx.id} className="p-4 flex justify-between items-center bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                          <div className="flex gap-4 items-center">
                            <div className="bg-blue-50 dark:bg-blue-900/20 p-2 rounded-lg">
                              <span className="material-symbols-outlined text-blue-600 dark:text-blue-400">{icon}</span>
                            </div>
                            <div>
                              <p className="text-[15px] font-bold text-slate-900 dark:text-white">{title}</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">Br {tx.branch_id || branchId} • {String(tx.time || '').slice(0, 5)}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-[15px] font-bold text-blue-600 dark:text-blue-400">{Number(tx.raw_price || 0).toLocaleString()} UGX</p>
                            <span className="material-symbols-outlined text-green-600 dark:text-green-400 text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                          </div>
                        </div>
                      );
                    })}
                    {recentTransactions.length === 0 && (
                      <div className="p-6 text-center text-slate-500 text-sm">No transactions today.</div>
                    )}
                  </div>
                </section>
              </div>
            )}


          </div>
        </div>

        {/* BottomNavBar (Mobile) */}
        <nav className="md:hidden fixed bottom-0 left-0 w-full h-16 flex justify-around items-center bg-surface dark:bg-inverse-surface px-xs pb-safe border-t border-outline-variant dark:border-outline z-50 shadow-lg">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`flex flex-col items-center justify-center active:scale-95 transition-transform duration-150 p-2 rounded-lg w-20 ${activeTab === 'dashboard' ? 'text-secondary dark:text-secondary-fixed font-bold' : 'text-on-surface-variant dark:text-outline-variant'}`}
          >
            <span className="material-symbols-outlined">analytics</span>
            <span className="font-label-sm text-label-sm mt-1">Dashboard</span>
          </button>
          <button 
            onClick={() => setActiveTab('inventory')}
            className={`flex flex-col items-center justify-center active:scale-95 transition-transform duration-150 p-2 rounded-lg w-20 ${activeTab === 'inventory' ? 'text-secondary dark:text-secondary-fixed font-bold' : 'text-on-surface-variant dark:text-outline-variant'}`}
          >
            <span className="material-symbols-outlined">inventory_2</span>
            <span className="font-label-sm text-label-sm mt-1">Stock</span>
          </button>
          <button 
            onClick={() => setActiveTab('transaction')}
            className={`flex flex-col items-center justify-center active:scale-95 transition-transform duration-150 p-2 rounded-lg w-20 ${activeTab === 'transaction' ? 'text-secondary dark:text-secondary-fixed font-bold' : 'text-on-surface-variant dark:text-outline-variant'}`}
          >
            <span className="material-symbols-outlined">receipt_long</span>
            <span className="font-label-sm text-label-sm mt-1">Transactions</span>
          </button>
          <button 
            onClick={() => setActiveTab('accounting')}
            className={`flex flex-col items-center justify-center active:scale-95 transition-transform duration-150 p-2 rounded-lg w-20 ${activeTab === 'accounting' ? 'text-secondary dark:text-secondary-fixed font-bold' : 'text-on-surface-variant dark:text-outline-variant'}`}
          >
            <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: `'FILL' ${activeTab === 'accounting' ? 1 : 0}` }}>account_balance</span>
            <span className="text-[10px] mt-1 font-medium">Accounting</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('analytics')}
            className={`flex flex-col items-center justify-center active:scale-95 transition-transform duration-150 p-2 rounded-lg w-20 ${activeTab === 'analytics' ? 'text-secondary dark:text-secondary-fixed font-bold' : 'text-on-surface-variant dark:text-outline-variant'}`}
          >
            <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: `'FILL' ${activeTab === 'analytics' ? 1 : 0}` }}>bar_chart</span>
            <span className="text-[10px] mt-1 font-medium">Analytics</span>
          </button>
          <button 
            onClick={() => { setActiveTab('quotations'); setQView('list'); }}
            className={`flex flex-col items-center justify-center active:scale-95 transition-transform duration-150 p-2 rounded-lg w-20 ${activeTab === 'quotations' ? 'text-secondary dark:text-secondary-fixed font-bold' : 'text-on-surface-variant dark:text-outline-variant'}`}
          >
            <span className="material-symbols-outlined">description</span>
            <span className="font-label-sm text-label-sm mt-1">Quotes</span>
          </button>
        </nav>

        {showAddProduct && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-surface-container-lowest rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="bg-primary px-6 py-4 flex items-center justify-between">
                <h3 className="text-white font-headline-sm font-bold flex items-center gap-2">
                  <span className="material-symbols-outlined">add_circle</span>
                  Add New Product
                </h3>
                <button onClick={() => setShowAddProduct(false)} className="text-white/80 hover:text-white transition-colors">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  <div>
                    <label className="block font-label-sm text-label-sm text-outline mb-1">Product Name</label>
                    <input 
                      type="text" 
                      value={newProductName} 
                      onChange={e => setNewProductName(e.target.value)}
                      placeholder="e.g. Triple Stove"
                      className="w-full h-11 px-3 border border-outline-variant rounded-lg font-body-md text-on-surface focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-label-sm text-label-sm text-outline mb-1">Base Price (UGX)</label>
                    <input 
                      type="number" 
                      min="0"
                      max="99999999.99"
                      step="0.01"
                      required
                      value={newProductPrice} 
                      onChange={e => setNewProductPrice(e.target.value)}
                      placeholder="e.g. 150000"
                      className="w-full h-11 px-3 border border-outline-variant rounded-lg font-body-md text-on-surface focus:ring-1 focus:ring-primary outline-none font-mono"
                    />
                  </div>
                </div>
                <div className="mt-8 flex gap-3 justify-end">
                  <button onClick={() => setShowAddProduct(false)} className="px-5 py-2 font-label-md font-semibold text-primary hover:bg-primary/10 rounded-full transition-colors">
                    Cancel
                  </button>
                  <button 
                    onClick={async () => {
                      const numericPrice = Number(newProductPrice);
                      if (!newProductName.trim() || newProductPrice === ''
                        || !Number.isFinite(numericPrice) || numericPrice < 0 || numericPrice > 99999999.99) {
                        setErrorMsg('Enter a product name and a valid price from 0 to 99,999,999.99 UGX.');
                        setTimeout(() => setErrorMsg(''), 3000);
                        return;
                      }
                      try {
                        setErrorMsg('');
                        await axios.post('http://localhost:5000/api/stoves', {
                          name: newProductName.trim(),
                          price: numericPrice
                        });
                        setMessage('Product added successfully!');
                        setTimeout(() => setMessage(''), 3000);
                        setShowAddProduct(false);
                        setNewProductName('');
                        setNewProductPrice('');
                        // Trigger a reload
                        loadData();
                      } catch (err) {
                        setErrorMsg(err.response?.data?.error || 'Failed to add product');
                        setTimeout(() => setErrorMsg(''), 3000);
                      }
                    }}
                    className="px-6 py-2 bg-primary text-white font-label-md font-semibold rounded-full hover:bg-primary/90 transition-colors shadow-sm"
                  >
                    Save Product
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <footer className="border-t border-slate-200/80 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-900/80 px-4 py-4 md:px-8">
          <div className="mx-auto max-w-6xl text-center">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-700 dark:text-slate-200">
              All rights reserved for FUEGO Uganda Limited
            </div>
            <div className="mt-1 text-[10px] text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
              fuegouganda@gmail.com &nbsp;•&nbsp; Phone: 0760033623 / 0788837621
            </div>
          </div>
        </footer>

      </main>
    </div>
  );
}

export default App;