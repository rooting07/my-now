/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Car, 
  ChevronRight, 
  MapPin, 
  Phone, 
  Star, 
  Map as MapIcon, 
  Clock, 
  CreditCard,
  User as UserIcon,
  LogOut,
  ArrowRight,
  Search,
  Menu,
  X,
  Plus
} from 'lucide-react';
import { cn } from './lib/utils';
import { 
  auth, 
  db, 
  signInWithGoogle, 
  signInWithFacebook, 
  handleFirestoreError, 
  OperationType,
  setupRecaptcha 
} from './lib/firebase';
import { 
  onAuthStateChanged, 
  User as FirebaseUser, 
  signOut, 
  signInWithPhoneNumber, 
  ConfirmationResult 
} from 'firebase/auth';
import { 
  collection,
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  serverTimestamp, 
  query, 
  where, 
  onSnapshot, 
  addDoc,
  orderBy,
  limit
} from 'firebase/firestore';
import { MapContainer, TileLayer, Marker, useMapEvents, Circle } from 'react-leaflet';
import L from 'leaflet';

// Fix Leaflet icon issue
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const BAGHDAD_COORDS: [number, number] = [33.3128, 44.3615];

declare global {
  interface Window {
    recaptchaVerifier: any;
  }
}

// --- Types ---
type Screen = 'splash' | 'login' | 'select' | 'booking' | 'rating' | 'driver_register' | 'profile' | 'driver_home' | 'admin';
type VehicleType = 'car' | 'tuk-tuk';
type ServiceType = 'regular' | 'luxury' | 'tuk-tuk';
type RideState = 'idle' | 'searching' | 'driver_found' | 'completed';
type PaymentMethod = 'cash' | 'card' | 'wallet';

interface UserProfile {
  userId: string;
  fullName: string;
  phone: string;
  email: string;
  role: 'customer' | 'driver';
  vehicleType?: VehicleType;
  vehicleModel?: string;
  plateNumber?: string;
  photoURL?: string;
  isVerified?: boolean;
}

interface Ride {
  id: string;
  customerId: string;
  driverId?: string;
  pickup: string;
  destination: string;
  pickupCoord: { lat: number, lng: number };
  customerPos?: { lat: number, lng: number };
  driverPos?: { lat: number, lng: number };
  destCoord: { lat: number, lng: number };
  status: 'requested' | 'accepted' | 'completed' | 'cancelled';
  price: string;
  serviceType: string;
  paymentMethod: string;
  createdAt: any;
  customerName?: string;
  customerPhone?: string;
}

// --- Admin Components ---
const AdminScreen = ({ onBack }: { onBack: () => void }) => {
  const [unverifiedDrivers, setUnverifiedDrivers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, 'users'),
      where('role', '==', 'driver'),
      where('isVerified', '==', false)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const drivers = snapshot.docs.map(doc => ({ ...doc.data() } as UserProfile));
      setUnverifiedDrivers(drivers);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleVerify = async (driverId: string) => {
    try {
      await updateDoc(doc(db, 'users', driverId), {
        isVerified: true,
        verifiedAt: serverTimestamp()
      });
      alert("تم تفعيل الكابتن بنجاح!");
    } catch (error) {
       console.error("Verification error:", error);
       alert("فشل في التفعيل. تأكد من الصلاحيات.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <header className="p-6 bg-black text-white flex justify-between items-center">
         <button onClick={onBack} className="p-2 bg-white/10 rounded-full hover:bg-white/20">
            <ChevronRight className="rotate-180" />
         </button>
         <h1 className="text-xl font-black italic">لوحة تحكم المسؤول</h1>
      </header>

      <div className="flex-1 p-6 space-y-4 overflow-y-auto">
        <h2 className="text-sm font-bold text-gray-500 text-right">كباتن ينتظرون التفعيل ({unverifiedDrivers.length})</h2>
        
        {loading ? (
          <p className="text-center py-10">جاري التحميل...</p>
        ) : unverifiedDrivers.length === 0 ? (
          <div className="bg-white p-10 rounded-3xl text-center border-2 border-dashed border-gray-200">
             <UserIcon className="mx-auto text-gray-300 mb-2" />
             <p className="text-gray-400 text-sm">لا يوجد كباتن بانتظار التفعيل حالياً</p>
          </div>
        ) : (
          unverifiedDrivers.map(driver => (
            <div key={driver.userId} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 space-y-4 text-right">
               <div className="flex justify-between items-start">
                  <div className="bg-blue-50 text-blue-600 px-3 py-1 rounded-full text-[10px] font-bold">driver candidate</div>
                  <div>
                    <h3 className="font-black text-lg">{driver.fullName}</h3>
                    <p className="text-xs text-gray-400">{driver.phone}</p>
                  </div>
               </div>
               
               <div className="grid grid-cols-2 gap-3 bg-gray-50 p-4 rounded-2xl">
                  <div className="text-right">
                    <p className="text-[10px] text-gray-400">نوع السيارة</p>
                    <p className="font-bold text-sm tracking-tight">{driver.vehicleType}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-gray-400">الموديل</p>
                    <p className="font-bold text-sm tracking-tight">{driver.vehicleModel}</p>
                  </div>
                  <div className="text-right border-t border-gray-200 pt-2 col-span-2">
                    <p className="text-[10px] text-gray-400">رقم اللوحة</p>
                    <p className="font-black text-sm tracking-widest">{driver.plateNumber}</p>
                  </div>
               </div>

               <button 
                onClick={() => handleVerify(driver.userId)}
                className="w-full bg-black text-[#FFD100] font-black py-4 rounded-2xl shadow-lg active:scale-95 transition-transform"
               >
                 تفعيل الكابتن الآن
               </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// --- Driver Components ---

const DriverHomeScreen = ({ user, userData, onProfileClick }: { user: FirebaseUser, userData: UserProfile | null, onProfileClick: () => void }) => {
  const [isOnline, setIsOnline] = useState(false);
  const [activeTab, setActiveTab] = useState<'orders' | 'history'>('orders');
  const [availableRides, setAvailableRides] = useState<Ride[]>([]);
  const [rideHistory, setRideHistory] = useState<Ride[]>([]);
  const [activeRide, setActiveRide] = useState<Ride | null>(null);

  const isVerified = userData?.isVerified === true;

  // Sync online status
  useEffect(() => {
    if (user && isVerified) {
      updateDoc(doc(db, 'users', user.uid), {
        isOnline: isOnline,
        lastActive: serverTimestamp()
      }).catch(err => console.error("Error updating online status:", err));
    }
  }, [isOnline, user, isVerified]);

  // Listen for available orders
  useEffect(() => {
    if (!isOnline || !isVerified) {
      setAvailableRides([]);
      return;
    }
    const q = query(
      collection(db, 'rides'),
      where('status', '==', 'requested'),
      orderBy('createdAt', 'desc'),
      limit(10)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const rides = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ride));
      setAvailableRides(rides);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'rides');
    });
    return () => unsubscribe();
  }, [isOnline, isVerified]);

  // Listen for my history
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'rides'),
      where('driverId', '==', user.uid),
      where('status', '==', 'completed'),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const rides = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ride));
      setRideHistory(rides);
    });
    return () => unsubscribe();
  }, [user]);

  // Listen for my active ride
  useEffect(() => {
    if (!user || !isOnline) return;
    const q = query(
      collection(db, 'rides'),
      where('driverId', '==', user.uid),
      where('status', '==', 'accepted'),
      limit(1)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        setActiveRide({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Ride);
      } else {
        setActiveRide(null);
      }
    });
    return () => unsubscribe();
  }, [user, isOnline]);

  // Update driver location when active ride
  useEffect(() => {
    if (!activeRide || !isOnline || !user) return;
    
    let watchId: number;
    if ("geolocation" in navigator) {
      watchId = navigator.geolocation.watchPosition((pos) => {
        updateDoc(doc(db, 'rides', activeRide.id), {
          driverPos: { lat: pos.coords.latitude, lng: pos.coords.longitude }
        }).catch(err => console.error("Error updating driver ride pos:", err));
      }, (err) => console.error("Geo error:", err), { enableHighAccuracy: true });
    }
    
    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, [activeRide, isOnline, user]);

  const handleAcceptRide = async (rideId: string) => {
    try {
      await updateDoc(doc(db, 'rides', rideId), {
        driverId: user.uid,
        status: 'accepted',
        driverName: userData?.fullName || user.displayName,
        driverCar: userData?.vehicleModel,
        driverPlate: userData?.plateNumber,
        driverRating: 4.8 // Mock rating for now
      });
    } catch (error) {
       console.error("Error accepting ride:", error);
       alert("لم نتمكن من قبول الطلب. ربما تم قبوله من كابتن آخر.");
    }
  };

  const handleCompleteRide = async (rideId: string) => {
    try {
      await updateDoc(doc(db, 'rides', rideId), {
        status: 'completed',
        completedAt: serverTimestamp()
      });
      alert("تم إكمال الرحلة بنجاح!");
    } catch (error) {
      console.error("Error completing ride:", error);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col font-sans">
      <header className="p-6 bg-white shadow-sm flex justify-between items-center">
        <button 
          onClick={onProfileClick}
          className="w-10 h-10 bg-black rounded-full flex items-center justify-center overflow-hidden border-2 border-[#FFD100]"
        >
          {user.photoURL ? <img src={user.photoURL} alt="P" className="w-full h-full object-cover" /> : <UserIcon className="text-[#FFD100] w-5 h-5" />}
        </button>
        <div className="text-right">
          <h2 className="font-bold text-black">لوحة الكابتن</h2>
          <p className="text-[10px] text-gray-500">{userData?.fullName || user.displayName}</p>
        </div>
      </header>

      <div className="flex-1 p-6 space-y-6 overflow-y-auto">
        {!isVerified && (
          <div className="bg-orange-50 border border-orange-200 p-6 rounded-[2rem] text-right space-y-2">
             <div className="flex items-center justify-end gap-2 text-orange-600 mb-1">
                <span className="text-xs font-black">حسابك قيد المراجعة</span>
                <Clock size={16} />
             </div>
             <p className="text-xs text-orange-800 leading-relaxed font-bold">
               أهلاً بك كابتن {userData?.fullName}. حسابك حالياً قيد التدقيق من قبل فريق الإدارة. سيتم تفعيل حسابك خلال 24 ساعة لتتمكن من استلام الطلبات.
             </p>
          </div>
        )}

        {activeRide ? (
          <div className="bg-black text-white p-6 rounded-[2rem] shadow-2xl space-y-4">
             <div className="flex justify-between items-center">
                <span className="bg-[#FFD100] text-black text-[10px] font-black px-2 py-1 rounded">رحلة نشطة</span>
                <p className="text-xl font-black">{activeRide.price}</p>
             </div>
             <div className="space-y-2 text-right">
                <p className="text-xs opacity-60">العميل: {activeRide.customerName || 'عميل سي تكسي'}</p>
                <div className="bg-white/10 p-4 rounded-xl space-y-1">
                   <p className="text-sm font-bold">{activeRide.pickup}</p>
                   <div className="h-4 border-r border-dashed border-white/20 mr-2" />
                   <p className="text-sm font-bold">{activeRide.destination}</p>
                </div>
             </div>
             
             {/* Map for driver */}
             <div className="h-48 w-full rounded-xl overflow-hidden relative border border-white/10">
                <MapContainer 
                  center={activeRide.pickupCoord} 
                  zoom={14} 
                  style={{ height: '100%', width: '100%' }}
                  zoomControl={false}
                >
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <Marker position={[activeRide.pickupCoord.lat, activeRide.pickupCoord.lng]} />
                  <Marker position={[activeRide.destCoord.lat, activeRide.destCoord.lng]} />
                  {activeRide.customerPos && (
                    <Circle center={[activeRide.customerPos.lat, activeRide.customerPos.lng]} radius={20} pathOptions={{ color: '#FFD100', fillColor: '#FFD100' }} />
                  )}
                </MapContainer>
                <div className="absolute top-2 right-2 z-[1000] bg-black/60 px-2 py-1 rounded text-[8px] text-white">موقع العميل المباشر</div>
             </div>

             <div className="flex gap-2">
                <button 
                  onClick={async () => {
                    if (confirm("هل أنت متأكد من إلغاء الطلب؟")) {
                      await updateDoc(doc(db, 'rides', activeRide.id), { status: 'cancelled' });
                    }
                  }}
                  className="flex-1 bg-white/10 text-white font-bold py-4 rounded-xl"
                >
                  إلغاء
                </button>
                <button 
                  onClick={() => handleCompleteRide(activeRide.id)}
                  className="flex-[2] bg-[#FFD100] text-black font-black py-4 rounded-xl shadow-lg"
                >
                  إتمام الرحلة
                </button>
             </div>
          </div>
        ) : (
          <div className={cn(
            "p-6 rounded-[2rem] shadow-xl transition-all duration-500",
            isOnline ? "bg-black text-white" : "bg-white text-black"
          )}>
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2">
                  <div className={cn("w-3 h-3 rounded-full animate-pulse", isOnline ? "bg-green-500" : "bg-gray-300")} />
                  <span className="text-xs font-bold">{isOnline ? 'أنت متصل الآن' : 'أنت غير متصل'}</span>
                </div>
                <button 
                  onClick={() => isVerified ? setIsOnline(!isOnline) : alert("يرجى الانتظار حتى يتم تفعيل حسابك من قبل الإدارة")}
                  className={cn(
                    "w-16 h-8 rounded-full relative transition-colors",
                    isOnline ? "bg-[#FFD100]" : "bg-gray-200",
                    !isVerified && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <motion.div 
                    animate={{ x: isOnline ? 30 : 2 }}
                    transition={{ type: 'spring', damping: 20 }}
                    className="w-6 h-6 bg-white rounded-full absolute top-1 shadow-sm" 
                  />
                </button>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/10 border border-white/10 p-4 rounded-2xl">
                  <p className="text-[10px] opacity-60">أرباح اليوم</p>
                  <p className="text-xl font-black">
                    {rideHistory.reduce((acc, r) => acc + parseInt(r.price.replace(/,/g, '')), 0).toLocaleString()} د.ع
                  </p>
                </div>
                <div className="bg-white/10 border border-white/10 p-4 rounded-2xl">
                  <p className="text-[10px] opacity-60">الرحلات</p>
                  <p className="text-xl font-black">{rideHistory.length}</p>
                </div>
            </div>
          </div>
        )}

        <div className="flex bg-gray-200 p-1 rounded-2xl">
           <button 
            onClick={() => setActiveTab('history')}
            className={cn("flex-1 py-3 text-sm font-bold rounded-xl transition-all", activeTab === 'history' ? "bg-white text-black shadow-sm" : "text-gray-500")}
           >
             السجل
           </button>
           <button 
            onClick={() => setActiveTab('orders')}
            className={cn("flex-1 py-3 text-sm font-bold rounded-xl transition-all", activeTab === 'orders' ? "bg-white text-black shadow-sm" : "text-gray-500")}
           >
             الطلبات
           </button>
        </div>

        <div className="space-y-4">
          {activeTab === 'orders' ? (
            <>
              <h3 className="font-bold text-right text-lg">طلبات قريبة</h3>
              {!isOnline ? (
                <div className="bg-white p-10 rounded-3xl text-center space-y-3 shadow-sm border border-dashed border-gray-200">
                   <Car className="mx-auto text-gray-300 w-12 h-12" />
                   <p className="text-gray-500 text-sm">قم بتفعيل الاتصال لاستلام الطلبات</p>
                </div>
              ) : availableRides.length === 0 ? (
                <div className="bg-white p-10 rounded-3xl text-center space-y-2 border border-gray-100 italic text-gray-400 text-xs">
                   جاري البحث عن طلبات جديدة...
                </div>
              ) : (
                availableRides.map(ride => (
                  <motion.div 
                    key={ride.id}
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="bg-white p-4 rounded-2xl shadow-md border-r-4 border-[#FFD100] flex items-center justify-between"
                  >
                    <button 
                      onClick={() => handleAcceptRide(ride.id)}
                      className="bg-black text-[#FFD100] px-6 py-2 rounded-xl text-sm font-bold"
                    >
                      قبول
                    </button>
                    <div className="text-right flex-1 pr-4">
                        <p className="font-bold text-sm truncate">{ride.pickup}</p>
                        <p className="text-[9px] text-gray-400 mb-1">إلى: {ride.destination}</p>
                        <p className="text-[10px] font-bold text-black">{ride.price}</p>
                    </div>
                  </motion.div>
                ))
              )}
            </>
          ) : (
            <div className="space-y-3">
               {rideHistory.length === 0 ? (
                 <div className="text-center py-10 text-gray-400 text-xs">لا توجد رحلات سابقة</div>
               ) : (
                rideHistory.map(ride => (
                  <div key={ride.id} className="bg-white p-4 rounded-2xl shadow-sm flex items-center justify-between border border-gray-100">
                      <span className="text-green-600 font-bold text-sm">+{ride.price}</span>
                      <div className="text-right">
                        <p className="font-bold text-sm text-black">{ride.destination}</p>
                        <p className="text-[10px] text-gray-400">
                          {ride.createdAt?.toDate?.() ? ride.createdAt.toDate().toLocaleDateString('ar-IQ') : ''}
                        </p>
                      </div>
                  </div>
                ))
               )}
            </div>
          )}
        </div>
      </div>
      
      <div className="p-6">
        <div className="bg-black p-4 rounded-2xl flex items-center justify-between">
           <div className="flex -space-x-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="w-6 h-6 rounded-full border-2 border-black bg-gray-500 overflow-hidden">
                   <img src={`https://i.pravatar.cc/100?img=${i+10}`} alt="" />
                </div>
              ))}
           </div>
           <p className="text-[10px] font-bold text-[#FFD100]">أكثر من 1,000 كابتن انضموا إلينا</p>
        </div>
      </div>
    </div>
  );
};

// --- Constants ---
const COLORS = {
  yellow: '#FFD100',
  black: '#000000',
  darkGray: '#121212',
  gray: '#F5F5F5',
};

const paymentLabels: Record<PaymentMethod, { label: string }> = {
  cash: { label: 'نقداً' },
  card: { label: 'بطاقة ائتمان' },
  wallet: { label: 'محفظة' }
};

const MOCK_DRIVER = {
  name: "أحمد محمد",
  rating: 4.8,
  car: "تويوتا كامري 2024",
  plate: "12345 أ - بغداد",
  trips: 1420
};

// --- Mock Components ---

const SplashScreen = ({ onFinish }: { onFinish: () => void, key?: string }) => {
  useEffect(() => {
    const timer = setTimeout(onFinish, 2000);
    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <div className="fixed inset-0 bg-[#FFD100] flex flex-col items-center justify-center z-50">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex flex-col items-center"
      >
        <div className="bg-black p-6 rounded-2xl shadow-2xl mb-4">
          <Car className="text-[#FFD100] w-20 h-20" />
        </div>
        <h1 className="text-4xl font-bold text-black tracking-widest">CI TAXI</h1>
      </motion.div>
    </div>
  );
};

const LoginScreen = ({ onLogin, onRegisterDriver }: { onLogin: (user: FirebaseUser) => void, onRegisterDriver: () => void }) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showEmailFields, setShowEmailFields] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!showEmailFields && !confirmationResult) {
      window.recaptchaVerifier = setupRecaptcha('recaptcha-container');
    }
    return () => {
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear();
      }
    };
  }, [showEmailFields, confirmationResult]);

  const handlePhoneSignIn = async () => {
    if (!phoneNumber) return alert("يرجى إدخال رقم الهاتف");
    const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+964${phoneNumber}`;
    
    try {
      setLoading('phone');
      const appVerifier = window.recaptchaVerifier;
      const result = await signInWithPhoneNumber(auth, formattedPhone, appVerifier);
      setConfirmationResult(result);
    } catch (error: any) {
      console.error("Phone sign in error:", error);
      alert("خطأ في إرسال الرمز. يرجى التأكد من الرقم.");
      if (window.recaptchaVerifier) window.recaptchaVerifier.render();
    } finally {
      setLoading(null);
    }
  };

  const handleVerifyCode = async () => {
    if (!verificationCode || !confirmationResult) return;
    try {
      setLoading('verify');
      const result = await confirmationResult.confirm(verificationCode);
      
      const userRef = doc(db, 'users', result.user.uid);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        await setDoc(userRef, {
          userId: result.user.uid,
          fullName: 'مستخدم جديد',
          phone: result.user.phoneNumber || '',
          role: 'customer',
          createdAt: serverTimestamp(),
          isVerified: false
        });
      }
      onLogin(result.user);
    } catch (error) {
      console.error("Verification error:", error);
      alert("الرمز غير صحيح.");
    } finally {
      setLoading(null);
    }
  };

  const handleSocialLogin = async (provider: 'google' | 'facebook') => {
    try {
      setLoading(provider);
      const result = await (provider === 'google' ? signInWithGoogle() : signInWithFacebook());
      
      const userRef = doc(db, 'users', result.user.uid);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        await setDoc(userRef, {
          userId: result.user.uid,
          fullName: result.user.displayName || 'مستخدم جديد',
          email: result.user.email || '',
          phone: '',
          role: 'customer',
          photoURL: result.user.photoURL || '',
          createdAt: serverTimestamp(),
          isVerified: false
        });
      }
      
      onLogin(result.user);
    } catch (error) {
       console.error("Login error:", error);
       alert("خطأ في تسجيل الدخول. يرجى التأكد من تفعيل الخدمة في الإعدادات.");
    } finally {
      setLoading(null);
    }
  };

  const handleEmailAuth = async () => {
    if (!email || !password) return alert("يرجى إدخال البريد وكلمة السر");
    try {
      setLoading('email');
      // Using createUserWithEmailAndPassword or signInWithEmailAndPassword
      // For simplicity we try to login, then catch to register or just say login
      const { signInWithEmailAndPassword, createUserWithEmailAndPassword } = await import('firebase/auth');
      
      let user;
      try {
        const result = await signInWithEmailAndPassword(auth, email, password);
        user = result.user;
      } catch (err: any) {
        if (err.code === 'auth/user-not-found') {
          const result = await createUserWithEmailAndPassword(auth, email, password);
          user = result.user;
          
          await setDoc(doc(db, 'users', user.uid), {
            userId: user.uid,
            fullName: email.split('@')[0],
            email: email,
            phone: '',
            role: 'customer',
            createdAt: serverTimestamp(),
            isVerified: false
          });
        } else {
          throw err;
        }
      }
      if (user) onLogin(user);
    } catch (error) {
      console.error("Email auth error:", error);
      alert("خطأ في الحساب. يرجى التأكد من البيانات.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col p-6 font-sans">
      <div className="mt-12 mb-8">
        <div className="w-16 h-16 bg-[#FFD100] rounded-2xl flex items-center justify-center mb-6">
          <Car className="text-black w-10 h-10" />
        </div>
        <h2 className="text-3xl font-bold text-white mb-2 text-right">أهلاً بك في سي تكسي</h2>
        <p className="text-gray-400 text-right">سجل دخولك لبدء رحلتك</p>
      </div>

      <div className="flex-1 space-y-6">
        <div id="recaptcha-container"></div>
        {!showEmailFields ? (
          <>
            {!confirmationResult ? (
              <>
                <div className="space-y-2">
                  <label className="text-sm text-gray-500 block text-right">رقم الهاتف</label>
                  <div className="flex items-center bg-[#1A1A1A] border border-gray-800 rounded-xl px-4 h-14">
                    <span className="text-gray-400 mr-2 font-mono">+964</span>
                    <input 
                      type="tel"
                      placeholder="770 000 0000"
                      className="flex-1 bg-transparent text-white focus:outline-none text-left font-mono"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                    />
                  </div>
                </div>

                <button 
                  onClick={handlePhoneSignIn}
                  disabled={loading === 'phone'}
                  className="w-full bg-[#FFD100] text-black font-bold h-14 rounded-xl shadow-lg hover:bg-yellow-400 transition-colors flex items-center justify-center gap-2 group"
                >
                  {loading === 'phone' ? (
                    <motion.div animate={{ rotate: 360 }} className="w-5 h-5 border-2 border-black border-t-transparent rounded-full" />
                  ) : (
                    <>
                      <span>بدء الاستخدام</span>
                      <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
              </>
            ) : (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm text-gray-500 block text-right">رمز التحقق (OTP)</label>
                  <input 
                    type="text"
                    placeholder="000000"
                    className="w-full bg-[#1A1A1A] border border-gray-800 rounded-xl h-14 px-4 text-center text-white tracking-[1em] font-mono focus:outline-none focus:border-[#FFD100]"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    maxLength={6}
                  />
                </div>
                <button 
                  onClick={handleVerifyCode}
                  disabled={loading === 'verify'}
                  className="w-full bg-[#FFD100] text-black font-bold h-14 rounded-xl shadow-lg flex items-center justify-center"
                >
                  {loading === 'verify' ? (
                    <motion.div animate={{ rotate: 360 }} className="w-5 h-5 border-2 border-black border-t-transparent rounded-full" />
                  ) : (
                    <span>تأكيد الرمز</span>
                  )}
                </button>
                <button 
                  onClick={() => setConfirmationResult(null)}
                  className="w-full text-gray-500 text-xs py-2"
                >
                  تغيير الرقم؟
                </button>
              </motion.div>
            )}
          </>
        ) : (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 text-right">
             <div className="space-y-2">
                <label className="text-sm text-gray-500">البريد الإلكتروني</label>
                <input 
                  type="email"
                  className="w-full bg-[#1A1A1A] border border-gray-800 rounded-xl px-4 h-14 text-white text-right"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
             </div>
             <div className="space-y-2">
                <label className="text-sm text-gray-500">كلمة السر</label>
                <input 
                  type="password"
                  className="w-full bg-[#1A1A1A] border border-gray-800 rounded-xl px-4 h-14 text-white text-right"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
             </div>
             <button 
              onClick={handleEmailAuth}
              disabled={loading === 'email'}
              className="w-full bg-[#FFD100] text-black font-bold h-14 rounded-xl shadow-lg hover:bg-yellow-400 transition-colors flex items-center justify-center gap-2"
            >
              {loading === 'email' ? 'جاري التحميل...' : 'دخول / تسجيل'}
            </button>
          </motion.div>
        )}

        <button 
          onClick={() => setShowEmailFields(!showEmailFields)}
          className="text-gray-500 text-xs w-full text-center"
        >
          {showEmailFields ? 'رجوع لتسجيل الهاتف' : 'تسجيل عبر البريد الإلكتروني؟'}
        </button>

        <div className="relative py-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-800"></div>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-black px-2 text-gray-500">أو تواصل عبر</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button 
            onClick={() => handleSocialLogin('google')}
            disabled={loading !== null}
            className="h-14 border border-gray-800 rounded-xl flex items-center justify-center gap-2 text-white hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            {loading === 'google' ? <motion.div animate={{ rotate: 360 }} className="w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <span className="text-sm">جوجل</span>}
          </button>
          <button 
            onClick={() => handleSocialLogin('facebook')}
            disabled={loading !== null}
            className="h-14 border border-gray-800 rounded-xl flex items-center justify-center gap-2 text-white hover:bg-white/5 transition-colors disabled:opacity-50"
          >
            {loading === 'facebook' ? <motion.div animate={{ rotate: 360 }} className="w-4 h-4 border-2 border-white border-t-transparent rounded-full" /> : <span className="text-sm">فيسبوك</span>}
          </button>
        </div>

        <button 
          onClick={onRegisterDriver}
          className="w-full h-16 border-2 border-dashed border-gray-800 rounded-2xl flex items-center justify-between px-6 text-white hover:border-[#FFD100] hover:bg-yellow-500/5 transition-all mt-4"
        >
          <ChevronRight className="rotate-180 text-gray-500" />
          <div className="text-right">
            <p className="font-bold text-[#FFD100]">انضم إلينا ككابتن</p>
            <p className="text-[10px] text-gray-500">ابدأ العمل معنا وحقق دخلاً إضافياً</p>
          </div>
        </button>
      </div>
      
      <p className="text-center text-gray-600 text-[10px] mt-auto">
        بالمتابعة أنت توافق على شروط الخدمة وسياسة الخصوصية
      </p>
    </div>
  );
};

const DriverRegisterScreen = ({ onBack, currentUser }: { onBack: () => void, currentUser: FirebaseUser | null }) => {
  const [step, setStep] = useState(1);
  const [vehicleType, setVehicleType] = useState<VehicleType>('car');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    vehicleModel: '',
    plateNumber: '',
  });

  const whatsappNumber = "07709634185";
  const whatsappLink = `https://wa.me/${whatsappNumber}`;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      if (currentUser) {
        // Update current user profile to driver (pending verification)
        const userRef = doc(db, 'users', currentUser.uid);
        await updateDoc(userRef, {
          role: 'driver',
          fullName: formData.fullName,
          phone: formData.phone,
          vehicleType,
          vehicleModel: formData.vehicleModel,
          plateNumber: formData.plateNumber,
          isVerified: false,
          updatedAt: serverTimestamp()
        });
      } else {
        // If not logged in, suggest logging in first or save as application
        // For simplicity in this demo, we'll tell them to login
        alert("يرجى تسجيل الدخول أولاً كمسافر ثم التقديم ككابتن");
        onBack();
        return;
      }
      
      alert("تم إرسال طلبك بنجاح! سيتم مراجعة الطلب من قبل الإدارة وتفعيل حسابك.");
      onBack();
    } catch (error) {
       console.error("Error submitting application:", error);
       alert("حدث خطأ أثناء إرسال الطلب. يرجى المحاولة مرة أخرى.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col p-6 text-right overflow-y-auto pb-10">
      <header className="flex justify-between items-center mb-8 mt-4">
        <button onClick={onBack} className="w-10 h-10 bg-gray-900 rounded-full flex items-center justify-center text-white">
          <X size={20} />
        </button>
        <div className="text-right">
          <h2 className="text-2xl font-bold text-white">تسجيل كابتن</h2>
          <p className="text-gray-500 text-xs text-right">أدخل بياناتك لتبدأ العمل</p>
        </div>
      </header>

      <div className="flex-1 space-y-6">
        <div className="flex justify-end gap-2 mb-4">
          {[1, 2, 3, 4].map(i => (
            <div 
              key={i} 
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === step ? "w-8 bg-[#FFD100]" : "w-4 bg-gray-800"
              )} 
            />
          ))}
        </div>

        {step === 1 && (
           <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <h3 className="text-white font-bold text-lg">نوع المركبة</h3>
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => setVehicleType('car')}
                  className={cn(
                    "flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all h-36 gap-2",
                    vehicleType === 'car' ? "border-[#FFD100] bg-yellow-500/10" : "border-gray-800 bg-gray-900"
                  )}
                >
                  <Car size={32} className={vehicleType === 'car' ? "text-[#FFD100]" : "text-gray-500"} />
                  <span className={cn("font-bold text-sm", vehicleType === 'car' ? "text-white" : "text-gray-500")}>سيارة</span>
                </button>
                <button 
                  onClick={() => setVehicleType('tuk-tuk')}
                  className={cn(
                    "flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all h-36 gap-2",
                    vehicleType === 'tuk-tuk' ? "border-[#FFD100] bg-yellow-500/10" : "border-gray-800 bg-gray-900"
                  )}
                >
                  <div className="relative">
                    <Car size={32} className={vehicleType === 'tuk-tuk' ? "text-[#FFD100]" : "text-gray-500"} />
                    <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] px-1 rounded">Tuk</div>
                  </div>
                  <span className={cn("font-bold text-sm", vehicleType === 'tuk-tuk' ? "text-white" : "text-gray-500")}>تكتك</span>
                </button>
              </div>
           </motion.div>
        )}

        {step === 2 && (
           <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <h3 className="text-white font-bold text-lg">المعلومات الشخصية</h3>
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs text-gray-500">الاسم الكامل</label>
                  <input 
                    type="text" 
                    placeholder="اكتب اسمك الثلاثي" 
                    value={formData.fullName}
                    onChange={(e) => setFormData({...formData, fullName: e.target.value})}
                    className="w-full bg-gray-900 border border-gray-800 rounded-xl h-14 px-4 text-white text-right focus:outline-none focus:border-[#FFD100]" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-500">رقم الهاتف</label>
                  <input 
                    type="tel" 
                    placeholder="0770 000 0000" 
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    className="w-full bg-gray-900 border border-gray-800 rounded-xl h-14 px-4 text-white text-left font-mono focus:outline-none focus:border-[#FFD100]" 
                  />
                </div>
              </div>
           </motion.div>
        )}

        {step === 3 && (
           <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <h3 className="text-white font-bold text-lg">معلومات المركبة</h3>
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs text-gray-500">{vehicleType === 'car' ? 'نوع السيارة والموديل' : 'موديل التكتك واللون'}</label>
                  <input 
                    type="text" 
                    placeholder={vehicleType === 'car' ? "مثلاً: تويوتا كامري 2023" : "مثلاً: تكتك باجاج 2024 أحمر"} 
                    value={formData.vehicleModel}
                    onChange={(e) => setFormData({...formData, vehicleModel: e.target.value})}
                    className="w-full bg-gray-900 border border-gray-800 rounded-xl h-14 px-4 text-white text-right focus:outline-none focus:border-[#FFD100]" 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-500">رقم اللوحة / رقم الهيكل</label>
                  <input 
                    type="text" 
                    placeholder="أدخل الرقم التعريفي للمركبة" 
                    value={formData.plateNumber}
                    onChange={(e) => setFormData({...formData, plateNumber: e.target.value})}
                    className="w-full bg-gray-900 border border-gray-800 rounded-xl h-14 px-4 text-white text-right focus:outline-none focus:border-[#FFD100]" 
                  />
                </div>
              </div>
           </motion.div>
        )}

        {step === 4 && (
           <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
              <h3 className="text-white font-bold text-lg">المستمسكات المطلوبة</h3>
              <p className="text-gray-400 text-xs">يرجى رفع صور واضحة للمستمسكات التالية لمركبة {vehicleType === 'car' ? 'السيارة' : 'التكتك'}</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="h-32 bg-gray-900 border-2 border-dashed border-gray-800 rounded-2xl flex flex-col items-center justify-center gap-2 group hover:border-[#FFD100] transition-colors cursor-pointer">
                   <div className="bg-gray-800 p-2 rounded-lg group-hover:bg-[#FFD100] group-hover:text-black text-gray-500 transition-colors">
                     <Search size={20} />
                   </div>
                   <span className="text-[10px] text-gray-500">هوية الأحوال</span>
                </div>
                <div className="h-32 bg-gray-900 border-2 border-dashed border-gray-800 rounded-2xl flex flex-col items-center justify-center gap-2 group hover:border-[#FFD100] transition-colors cursor-pointer">
                   <div className="bg-gray-800 p-2 rounded-lg group-hover:bg-[#FFD100] group-hover:text-black text-gray-500 transition-colors">
                     <Clock size={20} />
                   </div>
                   <span className="text-[10px] text-gray-500">{vehicleType === 'car' ? 'إجازة السوق' : 'سنوية التكتك'}</span>
                </div>
              </div>

              <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-xl mt-4">
                 <p className="text-yellow-500 text-[10px] leading-relaxed">يمكنك أيضاً مراسلة الحساب مباشرة على الواتساب لإرسال مستمسكاتك والحصول على رابط التقديم الفوري.</p>
              </div>
           </motion.div>
        )}
      </div>

      <div className="space-y-4 mt-8">
        <div className="flex gap-4">
          {step > 1 && (
             <button 
              onClick={() => setStep(s => s - 1)}
              className="flex-1 border border-gray-800 text-white h-14 rounded-xl font-bold"
             >
               السابق
             </button>
          )}
          <button 
            onClick={() => {
              if (step < 4) setStep(s => s + 1);
              else handleSubmit();
            }}
            className="flex-[2] bg-[#FFD100] text-black h-14 rounded-xl font-bold flex items-center justify-center gap-2"
          >
            {isSubmitting ? <motion.div animate={{ rotate: 360 }}><Search size={20} /></motion.div> : (
              <>
                <span>{step === 4 ? 'إرسال الطلب' : 'التالي'}</span>
                <ChevronRight size={20} />
              </>
            )}
          </button>
        </div>

        <a 
          href={whatsappLink} 
          target="_blank" 
          rel="noopener noreferrer"
          className="w-full h-14 bg-[#25D366] text-white rounded-xl flex items-center justify-center gap-3 font-bold shadow-lg"
        >
          <span>تواصل عبر واتساب</span>
          <Phone size={20} className="rotate-12" />
        </a>
      </div>
    </div>
  );
};

const ProfileScreen = ({ user, userData, onBack, onLogout, onAdminAction }: { user: FirebaseUser, userData: UserProfile | null, onBack: () => void, onLogout: () => void, onAdminAction: () => void }) => {
  const isAdmin = user.email === 'warth2223@gmail.com';
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    fullName: userData?.fullName || user.displayName || '',
    phone: userData?.phone || '',
  });

  const handleSave = async () => {
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        fullName: editData.fullName,
        phone: editData.phone,
        updatedAt: serverTimestamp()
      });
      setIsEditing(false);
      alert("تم تحديث البيانات بنجاح");
    } catch (error) {
      console.error("Error updating profile:", error);
      alert("حدث خطأ أثناء التحديث");
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col font-sans">
      <header className="p-6 flex justify-between items-center bg-white shadow-sm">
        <button onClick={onBack} className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
          <ChevronRight className="rotate-180" />
        </button>
        <h2 className="text-xl font-bold">الملف الشخصي</h2>
        <button 
          onClick={() => isEditing ? handleSave() : setIsEditing(true)}
          className="text-[#FFD100] bg-black px-4 py-1.5 rounded-full text-xs font-bold"
        >
          {isEditing ? 'حفظ' : 'تعديل'}
        </button>
      </header>

      <div className="p-6 flex flex-col items-center">
        <div className="w-24 h-24 bg-gray-200 rounded-full mb-4 border-4 border-white shadow-lg overflow-hidden flex items-center justify-center relative group">
          {user.photoURL ? <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" /> : <UserIcon size={48} className="text-gray-400" />}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer">
             <Plus size={20} className="text-white" />
          </div>
        </div>
        <h3 className="text-xl font-bold">{userData?.fullName || user.displayName}</h3>
        <p className="text-gray-500 text-sm">{userData?.role === 'driver' ? 'كابتن معتمد' : 'عميل'}</p>

        {userData?.role === 'driver' && (
          <div className="mt-4 bg-[#FFD100] px-4 py-1 rounded-full text-[10px] font-bold">
            {userData.isVerified ? 'حساب موثق' : 'بانتظار التوثيق'}
          </div>
        )}
      </div>

      <div className="bg-white mx-6 rounded-3xl p-6 space-y-6 shadow-sm border border-gray-100">
        <div className="text-right space-y-4">
          <div className="space-y-1">
            <label className="text-[10px] text-gray-400 uppercase">الاسم الكامل</label>
            {isEditing ? (
              <input 
                className="w-full bg-gray-50 border border-gray-200 rounded-xl h-12 px-4 text-right text-sm"
                value={editData.fullName}
                onChange={(e) => setEditData({...editData, fullName: e.target.value})}
              />
            ) : (
              <p className="font-bold text-gray-800">{userData?.fullName || user.displayName || 'لم يحدد'}</p>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-gray-400 uppercase">البريد الإلكتروني</label>
            <p className="font-bold text-gray-800">{user.email}</p>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-gray-400 uppercase">رقم الهاتف</label>
            {isEditing ? (
              <input 
                className="w-full bg-gray-50 border border-gray-200 rounded-xl h-12 px-4 text-left font-mono text-sm"
                placeholder="0770 000 0000"
                value={editData.phone}
                onChange={(e) => setEditData({...editData, phone: e.target.value})}
              />
            ) : (
              <p className="font-bold text-gray-800">{userData?.phone || 'غير مسجل'}</p>
            )}
          </div>
          {userData?.role === 'driver' && (
            <div className="pt-4 border-t border-gray-100 space-y-4">
              <div>
                <label className="text-[10px] text-gray-400 uppercase">نوع المركبة</label>
                <p className="font-bold text-gray-800">{userData.vehicleType === 'car' ? 'سيارة' : 'تكتك'}</p>
              </div>
              <div>
                <label className="text-[10px] text-gray-400 uppercase">الموديل</label>
                <p className="font-bold text-gray-800">{userData.vehicleModel}</p>
              </div>
              <div>
                <label className="text-[10px] text-gray-400 uppercase">رقم اللوحة</label>
                <p className="font-bold text-gray-800">{userData.plateNumber}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 px-6">
         <h4 className="text-right font-bold text-sm mb-4">اختصارات سريعة</h4>
         <div className="grid grid-cols-2 gap-4">
            {isAdmin && (
               <button 
                 onClick={onAdminAction}
                 className="bg-black p-4 rounded-2xl shadow-lg border border-black text-right space-y-2 col-span-2 group active:scale-95 transition-transform"
               >
                  <div className="bg-[#FFD100] w-8 h-8 rounded-lg flex items-center justify-center text-black">
                     <Star size={16} fill="black" />
                  </div>
                  <p className="text-xs font-bold text-[#FFD100]">لوحة تحكم المسؤول</p>
                  <p className="text-[10px] text-gray-400">راجع وفعل حسابات السواق</p>
               </button>
            )}
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 text-right space-y-2">
               <div className="bg-blue-50 w-8 h-8 rounded-lg flex items-center justify-center text-blue-500">
                  <Star size={16} />
               </div>
               <p className="text-xs font-bold">التقييمات</p>
               <p className="text-[10px] text-gray-400">4.9 / 5.0</p>
            </div>
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 text-right space-y-2">
               <div className="bg-orange-50 w-8 h-8 rounded-lg flex items-center justify-center text-orange-500">
                  <Clock size={16} />
               </div>
               <p className="text-xs font-bold">الرحلات</p>
               <p className="text-[10px] text-gray-400">12 رحلة مكتملة</p>
            </div>
         </div>
      </div>

      <div className="mt-auto p-6 space-y-4">
        <button 
          onClick={onLogout}
          className="w-full h-14 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center gap-2 font-bold hover:bg-red-100 transition-colors"
        >
          <LogOut size={20} />
          <span>تسجيل الخروج</span>
        </button>
      </div>
    </div>
  );
};

const ServiceSelectionScreen = ({ onSelect, onProfileClick, user }: { onSelect: (type: ServiceType) => void; onProfileClick: () => void; user: FirebaseUser | null }) => {
  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col p-6 overflow-y-auto pb-10">
      <header className="flex justify-between items-center mb-8">
        <button 
          onClick={onProfileClick}
          className="w-10 h-10 bg-black rounded-full flex items-center justify-center overflow-hidden border-2 border-[#FFD100]"
        >
          {user?.photoURL ? <img src={user.photoURL} alt="P" className="w-full h-full object-cover" /> : <UserIcon className="text-[#FFD100] w-5 h-5" />}
        </button>
        <div className="text-right">
          <h1 className="text-xl font-bold text-black font-sans">اختر نوع الخدمة</h1>
          <p className="text-gray-500 text-sm">أين وجهتك اليوم يا {user?.displayName?.split(' ')[0]}؟</p>
        </div>
      </header>

      <div className="space-y-4 flex-1">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onSelect('luxury')}
          className="w-full bg-black rounded-3xl p-6 text-right relative overflow-hidden group h-48 flex flex-col justify-between shadow-xl"
        >
          <div className="absolute top-[-20px] left-[-20px] opacity-10 group-hover:opacity-20 transition-opacity">
             <Car size={180} className="text-white rotate-[-20deg]" />
          </div>
          
          <div className="z-10 bg-[#FFD100] text-black text-[10px] uppercase font-black px-2 py-1 rounded w-fit self-end">
            Premium
          </div>

          <div className="z-10">
            <h3 className="text-[#FFD100] text-2xl font-black mb-1">تكسي فاخر</h3>
            <p className="text-gray-400 text-sm">سيارات حديثة - خدمة VIP - راحة تامة</p>
          </div>
          
          <div className="z-10 flex items-center justify-end gap-2 text-[#FFD100] group-hover:gap-4 transition-all">
            <span className="text-sm font-bold">اطلب الآن</span>
            <ChevronRight size={20} />
          </div>
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onSelect('regular')}
          className="w-full bg-white border border-gray-200 rounded-3xl p-6 text-right relative overflow-hidden group h-48 flex flex-col justify-between shadow-sm"
        >
          <div className="absolute top-[-20px] left-[-20px] opacity-5 group-hover:opacity-10 transition-opacity">
             <Car size={180} className="text-black rotate-[-20deg]" />
          </div>

          <div className="z-10 bg-black text-white text-[10px] uppercase font-black px-2 py-1 rounded w-fit self-end">
            Economy
          </div>

          <div className="z-10">
            <h3 className="text-black text-2xl font-black mb-1">تكسي عادي</h3>
            <p className="text-gray-500 text-sm">توفير - سرعة - توفر دائم</p>
          </div>
          
          <div className="z-10 flex items-center justify-end gap-2 text-black group-hover:gap-4 transition-all">
            <span className="text-sm font-bold">اطلب الآن</span>
            <ChevronRight size={20} />
          </div>
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onSelect('tuk-tuk')}
          className="w-full bg-[#FFD100]/20 border border-[#FFD100]/30 rounded-3xl p-6 text-right relative overflow-hidden group h-48 flex flex-col justify-between shadow-sm"
        >
          <div className="absolute top-[-20px] left-[-20px] opacity-10 group-hover:opacity-20 transition-opacity">
             <Car size={180} className="text-[#FFD100] rotate-[-20deg]" />
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-black text-4xl text-black">TUK</div>
          </div>

          <div className="z-10 bg-black text-[#FFD100] text-[10px] uppercase font-black px-2 py-1 rounded w-fit self-end">
            Fastest
          </div>

          <div className="z-10">
            <h3 className="text-black text-2xl font-black mb-1">تكتك</h3>
            <p className="text-gray-600 text-sm">أسرع في الزحام - سعر اقتصادي جداً</p>
          </div>
          
          <div className="z-10 flex items-center justify-end gap-2 text-black group-hover:gap-4 transition-all">
            <span className="text-sm font-bold">اطلب الآن</span>
            <ChevronRight size={20} />
          </div>
        </motion.button>
      </div>

      <div className="mt-8 bg-white p-4 rounded-2xl shadow-sm flex items-center justify-between">
        <div className="flex -space-x-2">
          {[1,2,3].map(i => (
            <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-[#FFD100] flex items-center justify-center text-[10px] font-bold">
              <UserIcon size={12} />
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500 font-medium">أكثر من 500 سائق متاح الآن في بغداد</p>
      </div>
    </div>
  );
};

const RatingScreen = ({ onFinish, driverInfo }: { onFinish: () => void, driverInfo?: any }) => {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');

  const displayDriver = driverInfo || MOCK_DRIVER;

  return (
    <div className="min-h-screen bg-white flex flex-col p-6 text-right">
      <div className="mt-12 mb-8 text-center">
        <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 border-4 border-[#FFD100] overflow-hidden">
           <UserIcon size={48} className="text-gray-400" />
        </div>
        <h2 className="text-2xl font-bold mb-1">{displayDriver.driverName || displayDriver.name}</h2>
        <p className="text-xs text-gray-400 mb-2">{displayDriver.driverCar || displayDriver.car}</p>
        <div className="flex items-center justify-center gap-1 text-gray-500 text-sm mb-4">
           <span>({displayDriver.trips || 0} رحلة)</span>
           <span className="font-bold text-black">{displayDriver.driverRating || displayDriver.rating || '5.0'}</span>
           <Star size={14} className="text-[#FFD100] fill-[#FFD100]" />
        </div>
        <div className="bg-gray-50 p-2 rounded-xl text-[10px] font-bold text-gray-500 mb-4 inline-block">
          {displayDriver.driverPlate || displayDriver.plate}
        </div>
        <p className="text-gray-500 text-sm">كيف كانت رحلتك مع الكابتن؟</p>
      </div>

      <div className="flex justify-center gap-2 mb-10">
        {[1, 2, 3, 4, 5].map((i) => (
          <button 
            key={i} 
            onClick={() => setStars(i)}
            className="transition-transform active:scale-110"
          >
            <Star 
              size={40} 
              className={cn(
                "transition-colors",
                i <= stars ? "text-[#FFD100] fill-[#FFD100]" : "text-gray-200"
              )} 
            />
          </button>
        ))}
      </div>

      <div className="space-y-4 flex-1">
        <textarea 
          placeholder="أضف تعليقك هنا (اختياري)..."
          className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 h-32 text-right focus:outline-none focus:border-[#FFD100] transition-colors"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        
        <div className="flex flex-wrap gap-2 justify-end">
           {['سائق محترف', 'سيارة نظيفة', 'وصول سريع', 'تعامل راقي'].map(tag => (
             <button key={tag} className="px-4 py-2 bg-gray-100 rounded-full text-xs font-medium hover:bg-[#FFD100] transition-colors">
               {tag}
             </button>
           ))}
        </div>
      </div>

      <button 
        onClick={onFinish}
        className="w-full bg-black text-[#FFD100] font-black h-14 rounded-xl shadow-lg mt-6"
      >
        إرسال التقييم
      </button>
    </div>
  );
};

const BookingScreen = ({ type, onBack, onComplete, user, userData }: { type: ServiceType, onBack: () => void, onComplete: (info: any) => void, user: FirebaseUser | null, userData: UserProfile | null }) => {
  const [pickup, setPickup] = useState('اختر موقع الانطلاق');
  const [destination, setDestination] = useState('');
  const [rideState, setRideState] = useState<RideState>('idle');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [showPaymentSelector, setShowPaymentSelector] = useState(false);
  const [currentRideId, setCurrentRideId] = useState<string | null>(null);
  const [driverInfo, setDriverInfo] = useState<any>(null);
  
  const [pickupCoord, setPickupCoord] = useState<{ lat: number, lng: number }>({ lat: BAGHDAD_COORDS[0], lng: BAGHDAD_COORDS[1] });
  const [destCoord, setDestCoord] = useState<{ lat: number, lng: number } | null>(null);
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);

  const searchLocation = async (query: string, isPickup: boolean) => {
    if (!query || query.length < 3) return;
    setIsSearchingLocation(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ' Baghdad')}&limit=1`);
      const data = await response.json();
      if (data && data.length > 0) {
        const { lat, lon, display_name } = data[0];
        const coords = { lat: parseFloat(lat), lng: parseFloat(lon) };
        if (isPickup) {
          setPickupCoord(coords);
          setPickup(display_name.split(',')[0]);
        } else {
          setDestCoord(coords);
          setDestination(display_name.split(',')[0]);
        }
      }
    } catch (err) {
      console.error("Search error:", err);
    } finally {
      setIsSearchingLocation(false);
    }
  };

  // Listen to ride updates
  useEffect(() => {
    if (!currentRideId) return;
    const unsubscribe = onSnapshot(doc(db, 'rides', currentRideId), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.status === 'accepted') {
          setRideState('driver_found');
          setDriverInfo(data);
        } else if (data.status === 'completed') {
          onComplete(data);
        } else if (data.status === 'cancelled') {
          setRideState('idle');
          setDriverInfo(null);
          setCurrentRideId(null);
          alert("نعتذر، تم إلغاء الرحلة");
        }
      }
    });
    return () => unsubscribe();
  }, [currentRideId, onComplete]);

  // Update customer location during ride
  useEffect(() => {
    if (!currentRideId || (rideState !== 'driver_found' && rideState !== 'searching')) return;
    
    let watchId: number;
    if ("geolocation" in navigator) {
      watchId = navigator.geolocation.watchPosition((pos) => {
        updateDoc(doc(db, 'rides', currentRideId), {
          customerPos: { lat: pos.coords.latitude, lng: pos.coords.longitude }
        }).catch(err => console.error("Error updating customer pos:", err));
      }, (err) => console.error(err), { enableHighAccuracy: true });
    }
    
    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, [currentRideId, rideState]);

  const calculatePrice = () => {
    if (!pickupCoord || !destCoord) {
      if (type === 'tuk-tuk') return '3,000 د.ع';
      return type === 'luxury' ? '15,000 د.ع' : '7,000 د.ع';
    }
    const dist = Math.sqrt(Math.pow(pickupCoord.lat - destCoord.lat, 2) + Math.pow(pickupCoord.lng - destCoord.lng, 2)) * 111;
    let base = type === 'luxury' ? 8000 : 4000;
    if (type === 'tuk-tuk') base = 2000;
    const perKm = type === 'tuk-tuk' ? 500 : 1000;
    const total = Math.round((base + dist * perKm) / 250) * 250;
    return total.toLocaleString() + ' د.ع';
  };

  const MapEventsHandler = () => {
    useMapEvents({
      click: (e) => {
        if (rideState !== 'idle') return;
        const { lat, lng } = e.latlng;
        if (!destCoord) {
          setDestCoord({ lat, lng });
          setDestination("وجهة تم تحديدها");
        } else {
          setPickupCoord({ lat, lng });
          setPickup("موقع تم تحديده");
        }
      }
    });
    return null;
  };

  const handleBooking = async () => {
    if (!user) return alert("سجل دخولك أولاً");
    if (!destCoord) return alert("يرجى تحديد الوجهة على الخريطة أولاً");
    setRideState('searching');
    try {
      const rideRef = await addDoc(collection(db, 'rides'), {
        customerId: user.uid,
        customerName: userData?.fullName || user.displayName,
        customerPhone: userData?.phone || '',
        pickup,
        destination,
        pickupCoord,
        destCoord,
        status: 'requested',
        price: calculatePrice(),
        serviceType: type,
        paymentMethod,
        createdAt: serverTimestamp()
      });
      setCurrentRideId(rideRef.id);
    } catch (error) {
      console.error("Booking error:", error);
      alert("خطأ في الطلب. يرجى المحاولة مرة أخرى.");
      setRideState('idle');
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col relative overflow-hidden">
      <div className="absolute inset-0 z-0">
        <MapContainer 
          center={BAGHDAD_COORDS} 
          zoom={13} 
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MapEventsHandler />
          <Marker position={[pickupCoord.lat, pickupCoord.lng]}>
          </Marker>
          {destCoord && (
            <Marker position={[destCoord.lat, destCoord.lng]}>
            </Marker>
          )}
          {driverInfo?.driverPos && (
            <div className="driver-marker">
              <Marker position={[driverInfo.driverPos.lat, driverInfo.driverPos.lng]}>
                 {/* Better to use custom icon for driver, but default for now */}
              </Marker>
            </div>
          )}
        </MapContainer>
      </div>

      <div className="z-10 p-4">
        <button 
          onClick={onBack}
          className="w-10 h-10 bg-white rounded-full shadow-lg flex items-center justify-center border border-gray-100"
        >
          <X size={20} />
        </button>
      </div>

      <motion.div 
        initial={{ y: 300 }}
        animate={{ y: 0 }}
        className="mt-auto bg-white rounded-t-[40px] shadow-[0_-10px_40px_rgba(0,0,0,0.1)] z-10 p-6 space-y-6"
      >
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto" />
        
        <div className="space-y-4">
          <div className="bg-gray-50 p-4 rounded-2xl flex items-center gap-4 text-right">
             <div className="flex-1">
                <p className="text-[10px] text-gray-400">من</p>
                <input 
                  type="text" 
                  value={pickup} 
                  onChange={(e) => setPickup(e.target.value)}
                  className="bg-transparent text-right w-full text-xs font-bold focus:outline-none"
                />
             </div>
             <div className="w-2 h-2 rounded-full bg-[#FFD100]" />
          </div>

          <div className="bg-white border-2 border-gray-100 p-4 rounded-2xl flex items-center gap-4 text-right focus-within:border-[#FFD100] transition-colors shadow-sm">
             <div className="flex-1 flex items-center">
                {isSearchingLocation ? (
                   <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }} className="mr-2">
                     <Clock size={16} className="text-[#FFD100]" />
                   </motion.div>
                ) : (
                   <Search className="w-4 h-4 text-gray-300 mr-2" />
                )}
                <input 
                  type="text"
                  placeholder="إلى أين وجهتك؟ اضغط Enter للبحث"
                  className="bg-transparent text-right flex-1 text-xs font-bold focus:outline-none"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && searchLocation(destination, false)}
                />
             </div>
             <div className="w-2 h-2 rounded-full border-2 border-black bg-white" />
          </div>
        </div>

        <div className="flex items-center justify-between bg-black/5 p-4 rounded-2xl">
          <div className="text-right">
            <p className="text-xs text-gray-500">سعر تقريبي</p>
            <p className="text-xl font-black text-black">{calculatePrice()}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className={cn(
              "px-3 py-1 rounded-full text-[9px] font-black border flex items-center gap-1",
              type === 'luxury' ? "bg-black text-[#FFD100] border-black" : "bg-[#FFD100] text-black border-[#FFD100]"
            )}>
              {type === 'luxury' ? 'LUXURY' : type === 'regular' ? 'ECONOMY' : 'TUK TUK'}
            </div>
            <button 
              onClick={() => setShowPaymentSelector(true)}
              className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-gray-100 shadow-sm"
            >
              <span className="text-[10px] font-bold">{paymentLabels[paymentMethod].label}</span>
              <CreditCard className="text-[#FFD100] w-4 h-4" />
            </button>
          </div>
        </div>

        <button 
          className="w-full bg-black text-[#FFD100] font-black h-16 rounded-2xl shadow-xl flex items-center justify-center gap-3 transition-transform active:scale-95 disabled:opacity-50"
          disabled={rideState === 'searching' || !destination}
          onClick={handleBooking}
        >
          {rideState === 'searching' ? (
             <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}>
               <Clock size={24} />
             </motion.div>
          ) : (
            <>
              <span className="text-lg">تأكيد الحجز</span>
              <ChevronRight className="w-5 h-5 rotate-180" />
            </>
          )}
        </button>
      </motion.div>

      {/* Driver Found Overlay */}
      <AnimatePresence>
        {rideState === 'driver_found' && (
          <motion.div 
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="fixed inset-x-0 bottom-0 z-[60] p-6"
          >
            <div className="bg-white w-full rounded-3xl p-6 text-right space-y-6 shadow-2xl border border-gray-100">
              <div className="flex justify-between items-start">
                 <div className="bg-[#FFD100] text-black px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">On My Way</div>
                 <h3 className="text-lg font-black italic">تم قبول طلبك</h3>
              </div>
              
              <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-2xl">
                 <div className="flex-1">
                    <p className="font-black text-xl">{driverInfo?.driverName}</p>
                    <div className="flex items-center justify-end gap-1 text-sm text-gray-500 mb-2">
                       <Star size={12} className="text-[#FFD100] fill-[#FFD100]" />
                       <span className="font-bold">{driverInfo?.driverRating || '5.0'} التقييم</span>
                    </div>
                    <div className="text-right space-y-1">
                       <p className="text-xs font-bold text-black bg-white px-2 py-1 rounded border border-gray-100 w-fit ml-auto">{driverInfo?.driverCar}</p>
                       <p className="text-sm font-black text-[#FFD100] bg-black px-2 py-1 rounded w-fit ml-auto tracking-widest">{driverInfo?.driverPlate}</p>
                    </div>
                 </div>
                 <div className="w-20 h-20 bg-gray-200 rounded-2xl flex items-center justify-center border-4 border-white shadow-sm overflow-hidden">
                    <UserIcon size={40} className="text-gray-400" />
                 </div>
              </div>

              <div className="flex gap-3">
                 <button 
                  onClick={async () => {
                    if (currentRideId) {
                      await updateDoc(doc(db, 'rides', currentRideId), { status: 'cancelled' });
                    }
                  }}
                  className="flex-1 bg-gray-100 text-black h-14 rounded-2xl font-bold"
                 >
                   إلغاء
                 </button>
                 <a 
                   href={`tel:${driverInfo?.driverPhone}`}
                   className="flex-[2] bg-black text-[#FFD100] h-14 rounded-2xl font-black flex items-center justify-center gap-3 shadow-lg"
                 >
                    <span>اتصال بالكابتن</span>
                    <Phone size={20} />
                 </a>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Searching Overlay */}
      <AnimatePresence>
        {rideState === 'searching' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-[70] flex items-center justify-center p-6 text-center"
          >
            <div className="space-y-8 max-w-xs">
              <div className="relative">
                <motion.div 
                  animate={{ scale: [1, 1.5, 1], rotate: [0, 360] }}
                  transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                  className="w-32 h-32 bg-[#FFD100] rounded-full flex items-center justify-center mx-auto shadow-[0_0_50px_rgba(255,209,0,0.4)]"
                >
                  <Car size={60} className="text-black" />
                </motion.div>
                <div className="absolute inset-0 animate-ping rounded-full border-2 border-[#FFD100] opacity-20" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-[#FFD100]">جاري البحث...</h3>
                <p className="text-gray-300 text-sm">نحن نتواصل مع أقرب الكباتن إليك الآن، يرجى الانتظار قليلاً</p>
              </div>
              <button 
                onClick={() => {
                  if (currentRideId) updateDoc(doc(db, 'rides', currentRideId), { status: 'cancelled' });
                  setRideState('idle');
                }}
                className="bg-white/10 text-white px-8 py-3 rounded-full text-xs font-bold hover:bg-white/20 transition-colors"
              >
                إلغاء الطلب
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Payment Selector Overlay */}
      <AnimatePresence>
        {showPaymentSelector && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] flex items-end justify-center"
            onClick={() => setShowPaymentSelector(false)}
          >
            <motion.div 
              initial={{ y: 300 }}
              animate={{ y: 0 }}
              exit={{ y: 300 }}
              className="bg-white w-full rounded-t-[40px] p-8 space-y-6"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto" />
              <h3 className="text-2xl font-black text-right">طريقة الدفع</h3>
              
              <div className="space-y-3">
                {(['cash', 'card', 'wallet'] as PaymentMethod[]).map((method) => (
                  <button 
                    key={method}
                    onClick={() => {
                      setPaymentMethod(method);
                      setShowPaymentSelector(false);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between p-5 rounded-2xl border-2 transition-all group",
                      paymentMethod === method ? "border-[#FFD100] bg-yellow-50/50" : "border-gray-50 bg-gray-50/50 hover:border-gray-200"
                    )}
                  >
                    <div className={cn(
                      "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors",
                      paymentMethod === method ? "border-[#FFD100]" : "border-gray-300"
                    )}>
                      {paymentMethod === method && <div className="w-3 h-3 rounded-full bg-[#FFD100]" />}
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="font-black">{paymentLabels[method].label}</p>
                        <p className="text-[10px] text-gray-400">{method === 'cash' ? 'الدفع عند الوصول' : 'رصيدك الحالي: 0 د.ع'}</p>
                      </div>
                      <div className="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                        {method === 'cash' && <Phone size={24} className="text-green-600" />}
                        {method === 'card' && <CreditCard size={24} className="text-blue-600" />}
                        {method === 'wallet' && <Star size={24} className="text-yellow-600" />}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('splash');
  const [selectedType, setSelectedType] = useState<ServiceType>('regular');
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userData, setUserData] = useState<UserProfile | null>(null);
  const [lastDriverInfo, setLastDriverInfo] = useState<any>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        const userRef = doc(db, 'users', u.uid);
        const userDoc = await getDoc(userRef);
        let currentRole = 'customer';
        if (userDoc.exists()) {
          const data = userDoc.data() as UserProfile;
          setUserData(data);
          currentRole = data.role;
        }
        
        if (currentScreen === 'login' || currentScreen === 'splash') {
          setCurrentScreen(currentRole === 'driver' ? 'driver_home' : 'select');
        }
      } else {
        setUser(null);
        setUserData(null);
        if (currentScreen !== 'splash' && currentScreen !== 'driver_register') {
          setCurrentScreen('login');
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    setCurrentScreen('login');
  };

  return (
    <div className="max-w-md mx-auto min-h-screen bg-white overflow-hidden shadow-2xl relative select-none">
      <AnimatePresence mode="wait">
        {currentScreen === 'splash' && (
          <SplashScreen key="splash" onFinish={() => {
            if (!user) setCurrentScreen('login');
            else setCurrentScreen('select');
          }} />
        )}

        {currentScreen === 'login' && (
          <motion.div 
            key="login"
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 100 }}
          >
            <LoginScreen 
              onLogin={(u) => {
                setUser(u);
                setCurrentScreen('select');
              }} 
              onRegisterDriver={() => setCurrentScreen('driver_register')}
            />
          </motion.div>
        )}

        {currentScreen === 'driver_register' && (
          <motion.div 
            key="driver_register"
            initial={{ y: 300, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 300, opacity: 0 }}
          >
            <DriverRegisterScreen onBack={() => setCurrentScreen('login')} currentUser={user} />
          </motion.div>
        )}

        {currentScreen === 'profile' && user && (
           <motion.div
            key="profile"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
           >
             <ProfileScreen 
              user={user} 
              userData={userData} 
              onBack={() => setCurrentScreen(userData?.role === 'driver' ? 'driver_home' : 'select')} 
              onLogout={handleLogout} 
              onAdminAction={() => setCurrentScreen('admin')}
             />
           </motion.div>
        )}

        {currentScreen === 'admin' && (
           <motion.div
            key="admin"
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
           >
             <AdminScreen onBack={() => setCurrentScreen('profile')} />
           </motion.div>
        )}

        {currentScreen === 'driver_home' && user && (
          <motion.div
            key="driver_home"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <DriverHomeScreen 
              user={user} 
              userData={userData} 
              onProfileClick={() => setCurrentScreen('profile')} 
            />
          </motion.div>
        )}

        {currentScreen === 'select' && (
          <motion.div 
            key="select"
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 100 }}
          >
            <ServiceSelectionScreen 
              user={user}
              onProfileClick={() => setCurrentScreen('profile')}
              onSelect={(type) => {
                setSelectedType(type);
                setCurrentScreen('booking');
              }} 
            />
          </motion.div>
        )}

        {currentScreen === 'booking' && (
          <motion.div 
            key="booking"
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 100 }}
          >
            <BookingScreen 
              type={selectedType} 
              onBack={() => setCurrentScreen('select')} 
              onComplete={(info) => {
                setLastDriverInfo(info);
                setCurrentScreen('rating');
              }}
              user={user}
              userData={userData}
            />
          </motion.div>
        )}

        {currentScreen === 'rating' && (
          <motion.div 
            key="rating"
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 100 }}
          >
            <RatingScreen 
              onFinish={() => setCurrentScreen('select')} 
              driverInfo={lastDriverInfo}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Decorative Status Bar (Simulated Mobile) */}
      <div className="absolute top-0 inset-x-0 h-8 flex items-center justify-between px-6 z-[60] bg-transparent pointer-events-none">
          <div className={cn("text-[10px] font-bold", currentScreen === 'login' ? 'text-white' : 'text-black')}>
            9:41
          </div>
          <div className="flex items-center gap-1">
            <div className={cn("w-3 h-3 border rounded-full", currentScreen === 'login' ? 'border-white' : 'border-black')} />
            <div className={cn("w-4 h-2 rounded-sm", currentScreen === 'login' ? 'bg-white' : 'bg-black')} />
          </div>
      </div>
    </div>
  );
}
