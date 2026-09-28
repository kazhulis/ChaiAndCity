import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Link, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Check, Minus, Plus, ShoppingBag, X } from 'lucide-react';
import './styles.css';
import { createPaymentSession } from './services/paymentService';
import { getParcelLockers, getShippingOptions } from './services/shippingService';
import heroImage from './assets/IMG_4472.jpg';

const productImageFiles = import.meta.glob('./assets/products/*.{jpg,jpeg,png,webp,avif,svg}', {
  eager: true,
  import: 'default',
  query: '?url',
});

function getProductImage(slug, fallback) {
  const matchingFile = Object.entries(productImageFiles).find(([path]) => {
    const filename = path.split('/').pop().split('.')[0];
    return filename === slug;
  });
  return matchingFile ? matchingFile[1] : fallback;
}

const products = [
  {
    id: 'uguns-udens-stihijas',
    name: 'UGUNS/ŪDENS',
    collection: 'stihijas',
    woocommerceId: 21,
    price: 12,
    image: getProductImage('uguns-udens', 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=1200&q=85'),
    description: 'Spēcīga, silta un līdzsvarojoša tējas kompozīcija vakariem, kad gribas atgriezties pie sevis.',
    ingredients: 'Ingvers, kanēlis, hibisks, rožu ziedlapiņas, apelsīna miziņa.',
  },
  {
    id: 'zeme-gaiss-stihijas',
    name: 'ZEME/GAISS',
    collection: 'stihijas',
    woocommerceId: 20,
    price: 12,
    image: getProductImage('zeme-gaiss', 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=1200&q=85'),
    description: 'Maiga un viegla zāļu tēja mierīgam rītam un lēnām sarunām pie galda.',
    ingredients: 'Citronmētra, kumelīte, lavanda, liepziedi, citronverbēna.',
  },
  {
    id: 'vinš-vina-stihijas',
    name: 'VIŅŠ/VIŅA',
    collection: 'stihijas',
    woocommerceId: 22,
    price: 12,
    image: getProductImage('vins-vina', 'https://images.unsplash.com/photo-1594631252845-29fc4cc8cde9?auto=format&fit=crop&w=1200&q=85'),
    description: 'Izteiksmīgs, augļains maisījums ar vakara noskaņu un dziļu, samtainu garšu.',
    ingredients: 'Roibošs, upenes, vīnogas, rozā pipari, damiana.',
  },
  {
    id: 'saule-meness-stihijas',
    name: 'SAULE/MĒNESS',
    collection: 'stihijas',
    woocommerceId: 13,
    price: 12,
    image: getProductImage('saule-meness', 'https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?auto=format&fit=crop&w=1200&q=85'),
    description: 'Gaiša, citrusaina tēja, kas ievelk saules gaismu arī pelēkākā dienā.',
    ingredients: 'Zaļā tēja, citronzāle, apelsīna ziedi, piparmētra.',
  },
];

const CartContext = createContext(null);
function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try {
      const storedItems = JSON.parse(localStorage.getItem('chai-cart')) || [];
      return storedItems.map((item) => ({
        ...item,
        woocommerceId: item.woocommerceId ?? products.find((product) => product.id === item.id)?.woocommerceId,
      }));
    } catch { return []; }
  });
  useEffect(() => localStorage.setItem('chai-cart', JSON.stringify(items)), [items]);
  const add = (product, quantity = 1) => setItems((current) => {
    const found = current.find((item) => item.id === product.id);
    return found ? current.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + quantity } : item) : [...current, { ...product, quantity }];
  });
  const change = (id, delta) => setItems((current) => current.map((item) => item.id === id ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item).filter((item) => item.quantity > 0));
  const remove = (id) => setItems((current) => current.filter((item) => item.id !== id));
  const value = useMemo(() => ({ items, add, change, remove, count: items.reduce((sum, item) => sum + item.quantity, 0), subtotal: items.reduce((sum, item) => sum + item.price * item.quantity, 0) }), [items]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
const useCart = () => useContext(CartContext);

function Header() {
  const { count } = useCart();
  const [open, setOpen] = useState(false);
  return <header className="site-header">
    <Link className="brand" to="/">CHAI AND CITY</Link>
    <nav className={open ? 'main-nav is-open' : 'main-nav'} aria-label="Galvenā navigācija">
      <Link to="/kolekcijas" onClick={() => setOpen(false)}>Iepērcies</Link>
      <Link to="/kolekcijas" onClick={() => setOpen(false)}>Kolekcijas</Link>
    </nav>
    <Link className="cart-link" to="/grozins" aria-label={`Groziņš, ${count} preces`}>
      <ShoppingBag size={18} strokeWidth={1.4} /><span>Groziņš</span><b>{count}</b>
    </Link>
    <button className="menu-toggle" onClick={() => setOpen(!open)} aria-label="Atvērt izvēlni"><span /><span /></button>
  </header>;
}

function AddButton({ product, quantity = 1 }) {
  const { add } = useCart();
  const [added, setAdded] = useState(false);
  const addToCart = () => { add(product, quantity); setAdded(true); setTimeout(() => setAdded(false), 1800); };
  return <button className="button button-dark add-button" onClick={addToCart}>{added ? <><Check size={15} /> Pievienots</> : 'Pievienot groziņam'}</button>;
}

function ProductCard({ product }) {
  return <article className="product-card">
    <Link to={`/produkti/${product.id}`} className="product-image-wrap"><img src={product.image} alt={`${product.name} tējas iepakojums`} /></Link>
    <div className="product-meta"><div><span className="eyebrow">{product.collection}</span><h3>{product.name}</h3></div><span className="price">{product.price.toFixed(2)} €</span></div>
    <AddButton product={product} />
  </article>;
}

function ProductGrid({ title = 'VISAS TĒJAS', limit }) {
  return <section className="products-section container"><div className="section-heading"><span className="eyebrow">{title}</span><span className="line" /></div><div className="product-grid">{products.slice(0, limit || products.length).map((product) => <ProductCard product={product} key={product.id} />)}</div></section>;
}

function Home() {
  return <><main>
    <section className="hero">
      <div className="hero-visual" aria-hidden="true">
        <img className="hero-image" src={heroImage} alt="Dabīgi tējas augi un ziedi uz smiltīm ar gliemežvākiem" />
      </div>
      <div className="hero-content">
        <span className="eyebrow">DABISKI MAISĪJUMI · RAŽOTS LATVIJĀ</span>
        <h1>NO DABAS<br /><i>LĪDZ TAVĀM MĀJĀM</i></h1>
        <p>Tējas ar raksturu, kas radītas no dabīgām sastāvdaļām un iedvesmotas no Latvijas dabas.</p>
        <div className="hero-actions">
          <Link className="button button-light" to="/kolekcijas">Iepērcies pēc kolekcijas <ArrowRight size={16} /></Link>
        </div>

      </div>
      
    </section>
    <ProductGrid />
    <section className="manifesto container"><span className="eyebrow">MŪSU STĀSTS</span><h2>Rituāls, kas sākas<br /><i>ar vienu krūzi.</i></h2><p>Mēs ticam, ka ikdienas mazajiem mirkļiem ir spēks. Tāpēc radām tējas, kas aicina apstāties, sajust un būt klātesošam.</p></section>
  </main></>;
}

function Collections() { return <main className="page container"><div className="page-intro"><span className="eyebrow">KOLEKCIJAS</span><h1>Tējas katram<br /><i>noskaņojumam.</i></h1><p>Četras tējas. Četri stāsti. Izvēlies savu šodienas rituālu.</p></div><ProductGrid title="stihijas" /></main>; }

function ProductDetail() {
  const { id } = useParams(); const product = products.find((item) => item.id === id) || products[0]; const [quantity, setQuantity] = useState(1);
  return <main className="detail-page container"><div className="detail-image"><img src={product.image} alt={`${product.name} tējas iepakojums`} /></div><div className="detail-copy"><span className="eyebrow">{product.collection}</span><h1>{product.name}</h1><div className="detail-price">{product.price.toFixed(2)} €</div><p className="detail-description">{product.description}</p><div className="detail-info"><div><span className="eyebrow">SASTĀVS</span><p>{product.ingredients}</p></div><div><span className="eyebrow">IEPAKOJUMS</span><p>50 g · aptuveni 25 krūzēm</p></div></div><div className="purchase-row"><div className="quantity"><button onClick={() => setQuantity(Math.max(1, quantity - 1))} aria-label="Samazināt daudzumu"><Minus size={15} /></button><span>{quantity}</span><button onClick={() => setQuantity(quantity + 1)} aria-label="Palielināt daudzumu"><Plus size={15} /></button></div><AddButton product={product} quantity={quantity} /></div></div><div className="related"><div className="section-heading"><span className="eyebrow">VARĒTU PATIKT ARĪ</span><span className="line" /></div><div className="product-grid">{products.filter((item) => item.id !== product.id).slice(0, 3).map((item) => <ProductCard product={item} key={item.id} />)}</div></div></main>;
}

function Cart() {
  const { items, subtotal, change, remove } = useCart(); const navigate = useNavigate(); const shipping = subtotal > 40 || subtotal === 0 ? 0 : 2.99;
  return <main className="cart-page container"><div className="page-title"><span className="eyebrow">GROZIŅŠ</span><h1>Tavs groziņš</h1></div>{items.length === 0 ? <div className="empty-state"><p>Tavs groziņš šobrīd ir tukšs.</p><Link className="button button-dark" to="/kolekcijas">Apskatīt tējas</Link></div> : <div className="cart-layout"><div className="cart-items">{items.map((item) => <div className="cart-item" key={item.id}><img src={item.image} alt="" /><div className="cart-item-info"><span className="eyebrow">{item.collection}</span><h3>{item.name}</h3><span>{item.price.toFixed(2)} €</span><div className="quantity"><button onClick={() => change(item.id, -1)} aria-label="Samazināt daudzumu"><Minus size={14} /></button><span>{item.quantity}</span><button onClick={() => change(item.id, 1)} aria-label="Palielināt daudzumu"><Plus size={14} /></button></div></div><button className="remove-button" onClick={() => remove(item.id)} aria-label={`Noņemt ${item.name}`}><X size={16} /></button></div>)}</div><aside className="summary"><span className="eyebrow">PASŪTĪJUMA KOPSAVILKUMS</span><div><span>Preces</span><span>{subtotal.toFixed(2)} €</span></div><div><span>Piegāde</span><span>{shipping ? `${shipping.toFixed(2)} €` : 'Bezmaksas'}</span></div><div className="summary-total"><b>Kopā</b><b>{(subtotal + shipping).toFixed(2)} €</b></div><button className="button button-dark full-width" onClick={() => navigate('/checkout')}>Noformēt pasūtījumu <ArrowRight size={16} /></button><small>Bezmaksas piegāde pasūtījumiem virs 40 €.</small></aside></div>}</main>;
}

const merchant = {
  name: 'SIA "Chai&City"',
  registrationNumber: 'LV40103843024',
  address: 'Hospitāļu iela 5-18, Rīga, LV-1013',
  email: 'tea.compress@gmail.com',
  phone: '+371 28 836 410',
};

function LegalPage({ type }) {
  const isPrivacy = type === 'privacy';
  return <main className="legal-page container">
    <div className="page-title"><span className="eyebrow">{isPrivacy ? 'PRIVĀTUMA POLITIKA' : 'LIETOŠANAS NOTEIKUMI'}</span><h1>{isPrivacy ? 'Tavi dati.' : 'Pirkuma noteikumi.'}</h1></div>
    {isPrivacy ? <div className="legal-copy">
      <p>Šī privātuma politika skaidro, kā SIA "Chai&City" apstrādā personas datus, izmantojot CHAI AND CITY interneta veikalu.</p>
      <h2>Kādi dati tiek apstrādāti</h2>
      <p>Pasūtījuma noformēšanai mēs apstrādājam vārdu, uzvārdu, e-pasta adresi, tālruņa numuru, piegādes informāciju un pasūtījuma datus. Šie dati ir nepieciešami pasūtījuma izpildei, saziņai ar klientu un grāmatvedības prasību izpildei.</p>
      <h2>Maksājumu apstrāde</h2>
      <p>Maksājumu apstrādi nodrošina maksājumu platforma <a href="https://makecommerce.lv" target="_blank" rel="noreferrer">makecommerce.lv</a>, tāpēc mūsu uzņēmums maksājumu izpildei nepieciešamos personas datus nodod platformas īpašniekam Maksekeskus AS. Kartes un maksājumu dati mūsu vietnē netiek glabāti.</p>
      <h2>Datu saņēmēji un glabāšana</h2>
      <p>Pasūtījuma izpildei nepieciešamie dati var tikt nodoti maksājumu un piegādes pakalpojumu sniedzējiem. Datus glabājam tikai tik ilgi, cik nepieciešams pasūtījuma izpildei un normatīvo aktu prasību izpildei.</p>
      <h2>Tavas tiesības</h2>
      <p>Tu vari pieprasīt piekļuvi saviem datiem, to labošanu vai dzēšanu, kā arī atsaukt piekrišanu, rakstot uz <a href={`mailto:${merchant.email}`}>{merchant.email}</a>. Tev ir tiesības iesniegt sūdzību Datu valsts inspekcijā.</p>
      <h2>Pārzinis</h2>
      <p>{merchant.name}, reģ. Nr. {merchant.registrationNumber}, {merchant.address}. Saziņai: <a href={`mailto:${merchant.email}`}>{merchant.email}</a>, {merchant.phone}.</p>
    </div> : <div className="legal-copy">
      <p>Šie noteikumi nosaka pirkumu veikšanas kārtību CHAI AND CITY interneta veikalā, ko pārvalda {merchant.name}.</p>
      <h2>Pirkuma veikšana un apmaksa</h2>
      <p>Pasūtījums tiek veikts, aizpildot checkout formu un nospiežot pogu “Maksāt”. Visas cenas norādītas eiro (EUR), ieskaitot piemērojamos nodokļus. Maksājumi tiek apstrādāti ar MakeCommerce; pieejamie maksājumu veidi var ietvert banklinkus un maksājumu kartes, ko klientam parāda maksājumu platforma.</p>
      <h2>Piegāde</h2>
      <p>Piegāde tiek nodrošināta ar pakomātu vai kurjeru. Piegādes cena tiek norādīta pasūtījuma kopsavilkumā pirms maksājuma. Pasūtījums tiek nosūtīts pēc maksājuma saņemšanas, parasti 2–5 darba dienu laikā; maksimālais piegādes termiņš ir 30 dienas, ja ar klientu nav saskaņots citādi.</p>
      <h2>Atgriešana un atteikuma tiesības</h2>
      <p>Patērētājs var izmantot atteikuma tiesības 14 dienu laikā no preces saņemšanas, nosūtot paziņojumu uz <a href={`mailto:${merchant.email}`}>{merchant.email}</a>. Precei jābūt nelietotai un tā jāatgriež drošā, nebojātā iepakojumā. Atteikuma tiesības neattiecas uz atvērtu tējas iepakojumu, jo tā ir higiēnas un veselības aizsardzības apsvērumu dēļ izslēdzama prece. Atgriešanas izmaksas sedz pircējs, izņemot gadījumus, kad saņemta neatbilstoša vai bojāta prece.</p>
      <h2>Pretenzijas</h2>
      <p>Par bojātu vai neatbilstošu preci, lūdzu, informē mūs, rakstot uz {merchant.email}. Patērētāja likumā noteiktās tiesības tiek saglabātas.</p>
      <h2>Pārdevēja rekvizīti</h2>
      <p>{merchant.name}, reģ. Nr. {merchant.registrationNumber}, {merchant.address}. E-pasts: <a href={`mailto:${merchant.email}`}>{merchant.email}</a>, tālrunis: {merchant.phone}.</p>
    </div>}
  </main>;
}

function Checkout() {
  const { items, subtotal } = useCart();
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [shippingError, setShippingError] = useState('');
  const [shippingOptions, setShippingOptions] = useState([
    { id: 'pakomats', name: 'Pakomāts', price: 2.99 },
    { id: 'kurjers', name: 'Kurjers', price: 5.9 },
  ]);
  const [lockers, setLockers] = useState([]);
  const [deliveryMethod, setDeliveryMethod] = useState('pakomats');
  const shipping = subtotal > 40 ? 0 : Number(shippingOptions.find((option) => option.id === deliveryMethod)?.price ?? 2.99);
  useEffect(() => {
    let active = true;
    Promise.all([getShippingOptions(), getParcelLockers()])
      .then(([optionsResponse, lockersResponse]) => {
        if (!active) return;
        const options = Array.isArray(optionsResponse) ? optionsResponse : optionsResponse?.options || optionsResponse?.data || [];
        const lockerList = Array.isArray(lockersResponse) ? lockersResponse : lockersResponse?.lockers || lockersResponse?.data || [];
        const availableOptions = options.filter((option) => option?.id && option?.name);
        if (availableOptions.length) setShippingOptions(availableOptions);
        setLockers(lockerList.filter((locker) => locker?.id && (locker.name || locker.label || locker.address)));
      })
      .catch((requestError) => {
        if (active) setShippingError(requestError.message);
      });
    return () => { active = false; };
  }, []);
  if (!items.length) return <main className="page container empty-state"><h1>Groziņš ir tukšs</h1><Link className="button button-dark" to="/kolekcijas">Apskatīt tējas</Link></main>;
  const deliveryOptions = lockers.map((locker) => ({ id: locker.id, label: locker.name || locker.label || locker.address, address: locker.address }));
  const submitOrder = async (event) => {
    event.preventDefault();
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const values = Object.fromEntries(form.entries());
      const payment = await createPaymentSession({
        customer: { firstName: values.firstName, lastName: values.lastName, email: values.email, phone: values.phone },
        delivery: { method: values.deliveryMethod, location: values.deliveryLocation, locationLabel: deliveryOptions.find((option) => option.id === values.deliveryLocation)?.label || values.deliveryLocation, cost: shipping },
        termsAccepted: values.termsAccepted === 'on',
        privacyAccepted: values.privacyAccepted === 'on',
        items: items.map((item) => ({
          productId: item.woocommerceId ?? products.find((product) => product.id === item.id)?.woocommerceId,
          quantity: item.quantity,
        })),
        total: subtotal + shipping,
      });
      if (payment.checkoutUrl) window.location.assign(payment.checkoutUrl);
      else setSubmitted(true);
    } catch (requestError) {
      setError(requestError.message);
    }
  };
  return <main className="checkout-page container"><div className="page-title"><span className="eyebrow">NOFORMĒT PASŪTĪJUMU</span><h1>Tava informācija</h1></div>{submitted ? <div className="success-message"><Check size={26} /><h2>Pasūtījums izveidots</h2><p>Maksājuma sesija ir izveidota serverī. Pasūtījums tiks atzīmēts kā apmaksāts tikai pēc droša maksājumu nodrošinātāja apstiprinājuma.</p><Link to="/" className="button button-dark">Atgriezties sākumā</Link></div> : <form className="checkout-layout" onSubmit={submitOrder}><div className="checkout-fields"><fieldset><legend>Kontakti</legend><div className="field-grid"><label>Vārds<input required name="firstName" /></label><label>Uzvārds<input required name="lastName" /></label></div><label>E-pasts<input required type="email" name="email" /></label><label>Tālrunis<input required type="tel" name="phone" /></label></fieldset><fieldset><legend>Piegāde</legend><label>Piegādes metode<select name="deliveryMethod" value={deliveryMethod} onChange={(event) => setDeliveryMethod(event.target.value)}>{shippingOptions.map((option) => <option value={option.id} key={option.id}>{option.name} — {Number(option.price).toFixed(2)} €</option>)}</select></label>{shippingError && <p className="form-error" role="alert">{shippingError}</p>}{deliveryMethod === 'pakomats' && deliveryOptions.length > 0 ? <label>Pakomāts / piegādes vieta<select required name="deliveryLocation" defaultValue=""><option value="" disabled>Izvēlies pakomātu</option>{deliveryOptions.map((option) => <option value={option.id} key={option.id}>{option.label}{option.address && option.address !== option.label ? ` — ${option.address}` : ''}</option>)}</select></label> : <label>{deliveryMethod === 'kurjers' ? 'Kurjera piegādes adrese' : 'Pakomāts / piegādes vieta'}<input required name="deliveryLocation" placeholder={deliveryMethod === 'kurjers' ? 'Iela, mājas nr., pilsēta, pasta indekss' : 'Ievadi piegādes vietu'} /></label>}</fieldset><fieldset className="consent-fieldset"><legend>Piekrišana</legend><label className="consent-label"><input required type="checkbox" name="termsAccepted" /> Piekrītu <Link to="/noteikumi" target="_blank">lietošanas noteikumiem</Link>.</label><label className="consent-label"><input required type="checkbox" name="privacyAccepted" /> Piekrītu <Link to="/privatuma-politika" target="_blank">privātuma politikai</Link>.</label></fieldset>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-dark payment-button" type="submit">Maksāt <ArrowRight size={16} /></button><p className="form-note">Maksājumi tiek apstrādāti MakeCommerce platformā. Norēķinu valūta ir EUR. Karte un maksājumu dati netiek glabāti šajā vietnē.</p></div><aside className="summary"><span className="eyebrow">TAVS PASŪTĪJUMS</span>{items.map((item) => <div className="summary-product" key={item.id}><span>{item.name} × {item.quantity}</span><span>{(item.price * item.quantity).toFixed(2)} €</span></div>)}<div><span>Piegāde</span><span>{shipping.toFixed(2)} €</span></div><div className="summary-total"><b>Kopā</b><b>{(subtotal + shipping).toFixed(2)} €</b></div></aside></form>}</main>;
}

function App() { const location = useLocation(); useEffect(() => { window.scrollTo(0, 0); const pageTitle = location.pathname === '/' ? 'No dabas līdz tavām mājām' : location.pathname.includes('checkout') ? 'Noformēt pasūtījumu' : location.pathname.includes('noteikumi') ? 'Lietošanas noteikumi' : location.pathname.includes('privatuma-politika') ? 'Privātuma politika' : 'Tējas'; document.title = `CHAI AND CITY — ${pageTitle}`; }, [location.pathname]); return <><Header /><Routes><Route path="/" element={<Home />} /><Route path="/kolekcijas" element={<Collections />} /><Route path="/produkti/:id" element={<ProductDetail />} /><Route path="/grozins" element={<Cart />} /><Route path="/checkout" element={<Checkout />} /><Route path="/noteikumi" element={<LegalPage type="terms" />} /><Route path="/privatuma-politika" element={<LegalPage type="privacy" />} /></Routes><footer className="site-footer"><div><span className="brand">CHAI AND CITY</span><p>{merchant.name} · Reģ. Nr. {merchant.registrationNumber}<br />{merchant.address}<br /><a href={`mailto:${merchant.email}`}>{merchant.email}</a> · <a href={`tel:${merchant.phone.replace(/\s/g, '')}`}>{merchant.phone}</a></p></div><nav className="footer-links" aria-label="Juridiskā informācija"><Link to="/noteikumi">Lietošanas noteikumi</Link><Link to="/privatuma-politika">Privātuma politika</Link></nav><span>Ražots Latvijā · © 2026</span></footer></>; }

createRoot(document.getElementById('root')).render(<HashRouter><CartProvider><App /></CartProvider></HashRouter>);
