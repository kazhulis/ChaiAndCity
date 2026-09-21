import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Link, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Check, Minus, Plus, ShoppingBag, X } from 'lucide-react';
import './styles.css';
import { createPaymentSession } from './services/paymentService';
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
    try { return JSON.parse(localStorage.getItem('chai-cart')) || []; } catch { return []; }
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
      <img className="hero-image" src={heroImage} alt="Dabīgi tējas augi un ziedi uz smiltīm ar gliemežvākiem" />
      <div className="hero-content"><span className="eyebrow">DABISKI MAISĪJUMI · RAŽOTS LATVIJĀ</span><h1>NO DABAS<br /><i>LĪDZ TAVĀM MĀJĀM</i></h1><p>Tējas ar raksturu, kas radītas no dabīgām sastāvdaļām un iedvesmotas no Latvijas dabas.</p><Link className="button button-light" to="/kolekcijas">Iepērcies pēc kolekcijas <ArrowRight size={16} /></Link></div>
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

function Checkout() {
  const { items, subtotal } = useCart(); const [submitted, setSubmitted] = useState(false); const [error, setError] = useState(''); const shipping = subtotal > 40 ? 0 : 2.99;
  if (!items.length) return <main className="page container empty-state"><h1>Groziņš ir tukšs</h1><Link className="button button-dark" to="/kolekcijas">Apskatīt tējas</Link></main>;
  const submitOrder = async (event) => {
    event.preventDefault();
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const values = Object.fromEntries(form.entries());
      const payment = await createPaymentSession({
        customer: { firstName: values.firstName, lastName: values.lastName, email: values.email, phone: values.phone },
        delivery: { method: values.deliveryMethod, location: values.deliveryLocation, cost: shipping },
        items: items.map(({ id, woocommerceId, quantity }) => ({ productId: woocommerceId || id, quantity })),
        total: subtotal + shipping,
      });
      if (payment.checkoutUrl) window.location.assign(payment.checkoutUrl);
      else setSubmitted(true);
    } catch (requestError) {
      setError(requestError.message);
    }
  };
  return <main className="checkout-page container"><div className="page-title"><span className="eyebrow">NOFORMĒT PASŪTĪJUMU</span><h1>Tava informācija</h1></div>{submitted ? <div className="success-message"><Check size={26} /><h2>Pasūtījums izveidots</h2><p>Maksājuma sesija ir izveidota serverī. Pasūtījums tiks atzīmēts kā apmaksāts tikai pēc droša maksājumu nodrošinātāja apstiprinājuma.</p><Link to="/" className="button button-dark">Atgriezties sākumā</Link></div> : <form className="checkout-layout" onSubmit={submitOrder}><div className="checkout-fields"><fieldset><legend>Kontakti</legend><div className="field-grid"><label>Vārds<input required name="firstName" /></label><label>Uzvārds<input required name="lastName" /></label></div><label>E-pasts<input required type="email" name="email" /></label><label>Tālrunis<input required type="tel" name="phone" /></label></fieldset><fieldset><legend>Piegāde</legend><label>Piegādes metode<select name="deliveryMethod" defaultValue="pakomats"><option value="pakomats">Pakomāts — 2.99 €</option><option value="kurjers">Kurjers — 5.90 €</option></select></label><label>Pakomāts / piegādes vieta<input required name="deliveryLocation" placeholder="Izvēlies pakomātu" /></label></fieldset>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-dark payment-button" type="submit">Maksāt <ArrowRight size={16} /></button><p className="form-note">Pēc pasūtījuma izveides maksājuma sesija tiek izveidota serverī. Karte un maksājumu dati nekad netiek glabāti šajā vietnē.</p></div><aside className="summary"><span className="eyebrow">TAVS PASŪTĪJUMS</span>{items.map((item) => <div className="summary-product" key={item.id}><span>{item.name} × {item.quantity}</span><span>{(item.price * item.quantity).toFixed(2)} €</span></div>)}<div><span>Piegāde</span><span>{shipping.toFixed(2)} €</span></div><div className="summary-total"><b>Kopā</b><b>{(subtotal + shipping).toFixed(2)} €</b></div></aside></form>}</main>;
}

function App() { const location = useLocation(); useEffect(() => { window.scrollTo(0, 0); document.title = location.pathname === '/' ? 'CHAI AND CITY — No dabas līdz tavām mājām' : `CHAI AND CITY — ${location.pathname.includes('checkout') ? 'Noformēt pasūtījumu' : 'Tējas'}`; }, [location.pathname]); return <><Header /><Routes><Route path="/" element={<Home />} /><Route path="/kolekcijas" element={<Collections />} /><Route path="/produkti/:id" element={<ProductDetail />} /><Route path="/grozins" element={<Cart />} /><Route path="/checkout" element={<Checkout />} /></Routes><footer className="site-footer"><span className="brand">CHAI AND CITY</span><span>Ražots Latvijā · © 2026</span><span>Instagram</span></footer></>; }

createRoot(document.getElementById('root')).render(<HashRouter><CartProvider><App /></CartProvider></HashRouter>);
