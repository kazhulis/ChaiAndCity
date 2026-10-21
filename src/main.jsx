import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, Link, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, Check, Instagram, Lock, Minus, Plus, ShoppingBag, X } from 'lucide-react';
import './styles.css';
import { createPaymentSession } from './services/paymentService';
import { getParcelLockers, getShippingCountries, getShippingOptions, setupMakeCommerceShipping } from './services/shippingService';
import { getProductPrices } from './services/productService';
import heroImage from './assets/IMG_4472.jpg';
import processImage from './assets/IMG_Process.JPG';
import buttonsImage from './assets/IMG_Pogas.JPG';

const productImageFiles = import.meta.glob('./assets/products/*/*.png', {
  eager: true,
  import: 'default',
  query: '?url',
});

function getProductImages(folder) {
  return [1, 2, 3, 4, 5]
    .map((n) => productImageFiles[`./assets/products/${folder}/${n}.png`])
    .filter(Boolean);
}
const baseProducts = [
  {
    id: 'uguns-udens-stihijas',
    name: 'UGUNS/ŪDENS',
    collection: 'stihijas',
    woocommerceId: 21,
    images: getProductImages('UGUNS_UDENS'),
    image: getProductImages('UGUNS_UDENS')[0],
    description: 'UGUNS kompozīcija atmodina sajūtas un sniedz enerģijas dzirksti ar sildošu un dinamisku augu maisījumu. Savukārt ŪDENS apvieno nomierinošas un svaigas sastāvdaļas, iedvesmojoties no ūdens mierīgās un plūstošās dabas.',
    ingredients: 'UGUNS: raudene, ehinācija, lofants, kliņģerīte, kardamons, rozā pipari. \nŪDENS: māllepe, melisa, svētais baziliks, citronzāle, bambusa lapas.',
  },
  {
    id: 'zeme-gaiss-stihijas',
    name: 'ZEME/GAISS',
    collection: 'stihijas',
    woocommerceId: 20,
    images: getProductImages('GAISS_ZEME'),
    image: getProductImages('GAISS_ZEME')[0],
    description: 'ZEME ir piezemējošs augu maisījums ar siltām sastāvdaļām, kas radīts, lai saskaņotu dzērāju ar šo elementu. GAISS ir viegls un aromātisks augu maisījums ar rūpīgi izvēlētām sastāvdaļām, iedvesmojoties no gaisa svaiguma un kustības.',
    ingredients: 'ZEME: cigoriņš, ingvers, parmētra, liepu ziedi, kurkuma, bambusa lapas, kliņģerīte. \nGAISS: rozmarīns, lavanda, rožu lapas, lofants, salvija.',
  },
  {
    id: 'vinš-vina-stihijas',
    name: 'VIŅŠ/VIŅA',
    collection: 'stihijas',
    woocommerceId: 22,
    images: getProductImages('VINS_VINA'),
    image: getProductImages('VINS_VINA')[0],
    description: 'VIŅŠ un VIŅA ir tēju spēle romantiku mīlošiem pāriem un ikvienam, kurš vēlas izcelt savu vīrišķo vai sievišķo iedabu. Veidojot tēju garšu un iedarbības saspēli, atlasīti augi no Latvijas un citām valstīm.',
    ingredients: 'VIŅA: vērbena, liepu ziedi, kalnrozīte, damiāns, virši, timiāns. \nVIŅŠ: aroniju lapas, ugunspuķe, ragainās kazes zāle, pu-erh, kadiķogas.',
  },
  {
    id: 'saule-meness-stihijas',
    name: 'SAULE/MĒNESS',
    collection: 'stihijas',
    woocommerceId: 13,
    images: getProductImages('SAULE_MENESS'),
    image: getProductImages('SAULE_MENESS')[0],
    description: 'SAULES un MĒNESS tējas simbolizē dienas un nakts maiņu un mūsu ķermeņa pakļaušanos tai. SAULES tējas sastāvs radīts, lai apmierinātu enerģijas, vitalitātes un dienas sākumavajadzības. MĒNESS tēja atbalsta vēlmi pēc miera, pārdomām un miega.',
    ingredients: 'SAULE: mate, liepu ziedi, timiāns, pelašķis, saulespuķe, rozā pipari. \nMĒNESS: pūķgalve, vīgrieži, gotu-kola, melisa, rudzupuķes.',
  },
  {
    id: 'prats-sirds-stihijas',
    name: 'PRĀTS/SIRDS',
    collection: 'stihijas',
    woocommerceId: 77,
    images: getProductImages('PRATS_SIRDS'),
    image: getProductImages('PRATS_SIRDS')[0],
    description: 'PRĀTA tēja apvieno augus, kas pazīstami ar spēju veicināt pārdomas un dziļāku izpratni. Savukārt SIRDS tēja ietver nomierinošus augus, kas paver ceļu pateicībai un izpratnei.',
    ingredients: 'PRĀTS: tulsi, gotu kola, kurkuma, koriandrs, deviņvīruspēks, fenhelis. \nSIRDS: kascara, liepu ziedi, lofants, cigoriņš.',
  },
];

const CartContext = createContext(null);
function CartProvider({ children }) {
  const [prices, setPrices] = useState(null);
  const [pricesFailed, setPricesFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    getProductPrices().then((data) => { if (!cancelled) setPrices(data); }).catch(() => { if (!cancelled) setPricesFailed(true); });
    return () => { cancelled = true; };
  }, []);
  const products = useMemo(() => baseProducts.map((product) => ({ ...product, price: prices?.[product.woocommerceId]?.price ?? null, regularPrice: prices?.[product.woocommerceId]?.regularPrice ?? null, inStock: prices?.[product.woocommerceId]?.inStock !== false })), [prices]);
  const [rawItems, setItems] = useState(() => {
    try {
      const storedItems = JSON.parse(localStorage.getItem('chai-cart')) || [];
      return storedItems.map(({ price, regularPrice, inStock, ...item }) => ({
        ...item,
        woocommerceId: item.woocommerceId ?? baseProducts.find((product) => product.id === item.id)?.woocommerceId,
      }));
    } catch { return []; }
  });
  useEffect(() => localStorage.setItem('chai-cart', JSON.stringify(rawItems)), [rawItems]);
  const items = useMemo(() => rawItems.map((item) => ({ ...item, price: prices?.[item.woocommerceId]?.price ?? null, regularPrice: prices?.[item.woocommerceId]?.regularPrice ?? null, inStock: prices?.[item.woocommerceId]?.inStock !== false })), [rawItems, prices]);
  const add = (product, quantity = 1) => setItems((current) => {
    const { price, regularPrice, inStock, ...rest } = product;
    const found = current.find((item) => item.id === product.id);
    return found ? current.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + quantity } : item) : [...current, { ...rest, quantity }];
  });
  const change = (id, delta) => setItems((current) => current.map((item) => item.id === id ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item).filter((item) => item.quantity > 0));
  const remove = (id) => setItems((current) => current.filter((item) => item.id !== id));
  const clear = () => setItems([]);
  const pricesReady = prices !== null && items.every((item) => item.price !== null);
  const stockOk = items.every((item) => item.inStock);
  const value = useMemo(() => ({ items, products, pricesReady, stockOk, pricesLoading: prices === null && !pricesFailed, add, change, remove, clear, count: items.reduce((sum, item) => sum + item.quantity, 0), subtotal: items.reduce((sum, item) => sum + (item.price ?? 0) * item.quantity, 0) }), [items, products, prices, pricesFailed, pricesReady, stockOk]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
const useCart = () => useContext(CartContext);

const formatPrice = (price) => price === null || price === undefined ? null : `${price.toFixed(2)} €`;
const PRICE_UNAVAILABLE = '-';
function PriceTag({ item }) {
  if (item.price === null) return PRICE_UNAVAILABLE;
  if (!item.regularPrice) return formatPrice(item.price);
  return <><s className="price-old">{formatPrice(item.regularPrice)}</s> <span className="price-sale">{formatPrice(item.price)}</span></>;
}
function PriceUnavailableNotice() {
  return <p className="price-notice" role="status">Cenas īslaicīgi nav pieejamas. Lūdzu, mēģini vēlreiz pēc brīža.</p>;
}

function Header() {
  const { count } = useCart();
  const [open, setOpen] = useState(false);
  return <header className="site-header">
    <Link className="brand" to="/">CHAI AND CITY</Link>
    <nav className={open ? 'main-nav is-open' : 'main-nav'} aria-label="Galvenā navigācija">
      <Link to="/kolekcijas/stihijas" onClick={() => setOpen(false)}>Iepērcies</Link>
      {/*<Link to="/kolekcijas" onClick={() => setOpen(false)}>Kolekcijas</Link>*/}
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
  return <button className="button button-dark add-button" disabled={product.price === null || !product.inStock} onClick={addToCart}>{!product.inStock ? 'Nav noliktavā' : added ? <><Check size={15} /> Pievienots</> : 'Pievienot groziņam'}</button>;
}

function ProductCard({ product }) {
  return <article className="product-card">
    <Link to={`/produkti/${product.id}`} className="product-image-wrap"><img src={product.image} alt={`${product.name} tējas iepakojums`} /></Link>
    <div className="product-meta"><div><span className="eyebrow">{product.collection}</span><h3>{product.name}</h3></div><span className="price"><PriceTag item={product} /></span></div>
    <AddButton product={product} />
  </article>;
}

function ProductGrid({ title = 'VISAS TĒJAS', limit }) {
  const { products, pricesReady, pricesLoading } = useCart();
  return <section className="products-section container"><div className="section-heading"><span className="eyebrow">{title}</span><span className="line" /></div>{!pricesReady && !pricesLoading && <PriceUnavailableNotice />}<div className="product-grid">{products.slice(0, limit || products.length).map((product) => <ProductCard product={product} key={product.id} />)}</div></section>;
}

function Home() {
  return <><main>
    <section className="hero">
      <div className="hero-visual" aria-hidden="true">
        <img className="hero-image" src={heroImage} alt="Dabīgi tējas augi un ziedi uz smiltīm ar gliemežvākiem" />
      </div>
      <div className="hero-content">
        <span className="eyebrow">TĒJA IECEĻO PILSĒTĀ</span>
        <h1>Presēta augu tēja. Roku darbs.</h1>
        <p>Katrs augs ar savu raksturu, katrs salikums ir savs elements. Atklāj presētu augu tēju, kas radīta <i>ikdienas tējas rituāliem.</i></p>
        <div className="hero-actions">
          <Link className="button button-light" to="/kolekcijas/stihijas">Iepērcies <ArrowRight size={16} /></Link>
        </div>

      </div>
      
    </section>
    <ProductGrid />
    {/*<section className="manifesto container"><span className="eyebrow">MŪSU STĀSTS</span><h2>Rituāls, kas sākas<br /><i>ar vienu krūzi.</i></h2><p>Mēs ticam, ka ikdienas mazajiem mirkļiem ir spēks. Tāpēc radām tējas, kas aicina apstāties, sajust un būt klātesošam.</p></section>*/}
        <section className="info-block container">
          <img src={processImage} alt="Tējas pogu tapšanas process" />
          <div><span className="eyebrow">PAR CHAI AND CITY</span><p>CHAI AND CITY apvieno Latvijas dabas augus ar iedvesmu no senajām Āzijas tējas presēšanas tradīcijām. Radām ar rokām veidotas tējas pogas, kurās katram augu salikumam ir sava ideja, raksturs un stihija. Mūsu pieeja balstās rūpīgā augu izvēlē, garšu saderībā un vēlmē ieviest tējas baudīšanā jaunu, apzinātu rituālu.</p></div>
        </section>
        <section className="info-block info-block-reverse container">
          <img src={buttonsImage} alt="Presētās tējas pogas" />
          <div><span className="eyebrow">PAR TĒJU</span><p>Apvienojot Latvijas un Āzijas augus sastāvā, atklājam bagātīgo un daudzveidīgo herbālo tēju garšu pasauli. Katrai kompozīcijai ir sava būtība, kas aicina iepazīt savu valdošo stihiju, to izcelt vai meklēt līdzsvaru ar pretējo elementu.</p></div>
        </section>
      </main></>;
}

const collectionSlots = [
  { number: '02', title: 'JAUNAIS STĀSTS', status: 'DRĪZUMĀ' },
  { number: '03', title: 'VĒL VIENA PASAULE', status: 'NAV ATVĒRTA' },
  { number: '04', title: 'TAVA NĀKAMĀ TĒJA', status: 'NAV ATVĒRTA' },
];

function Collections() {
  return <main className="collections-page container">
    <div className="collections-intro">
      <span className="eyebrow">ATRODI SAVU RITUĀLU</span>
      <h1>Kolekcijas</h1>
      <p>Katrs maisījums sākas ar savu stāstu. Izvēlies atvērtu kolekciju vai ieskaties, kas vēl tikai top.</p>
    </div>
    <section className="collection-grid" aria-label="Tējas kolekcijas">
      <Link className="collection-tile collection-tile-active" to="/kolekcijas/stihijas">
        <img src={baseProducts[0].image} alt="" />
        <span className="collection-tile-shade" />
        <span className="collection-tile-top"><span>01 / PIEEJAMA</span><ArrowRight size={18} /></span>
        <span className="collection-tile-bottom"><span className="eyebrow">ČETRI MAISĪJUMI · VIENS LĪDZSVARS</span><strong>STIHIJAS</strong><span className="collection-tile-cta">Atklāt kolekciju <ArrowRight size={15} /></span></span>
      </Link>
      {collectionSlots.map((collection) => <article className="collection-tile collection-tile-locked" key={collection.number} aria-label={`${collection.title}, ${collection.status}`}>
        <span className="collection-tile-top"><span>{collection.number} / BLOĶĒTA</span><Lock size={18} /></span>
        <span className="collection-lock-mark" aria-hidden="true"><Lock size={25} strokeWidth={1.2} /></span>
        <span className="collection-tile-bottom"><span className="eyebrow">{collection.status}</span><strong>{collection.title}</strong><span className="collection-tile-cta">Kolekcija vēl top</span></span>
      </article>)}
    </section>
  </main>;
}

function ElementsCollection() {
  return <main className="page container">
    <div className="page-intro collection-products-intro">
      <span className="eyebrow">KOLEKCIJA 01</span>
      <h1>STIHIJAS</h1>
      <p>Četras tējas. Četri stāsti. Izvēlies savu šodienas rituālu.</p>
    </div>
    <ProductGrid title="STIHIJU TĒJAS" />
  </main>;
}

function ProductDetail() {
  const { id } = useParams(); const { products, pricesReady, pricesLoading } = useCart(); const product = products.find((item) => item.id === id) || products[0]; const [quantity, setQuantity] = useState(1);
  return <main className="detail-page container"><div className="detail-gallery"><div className="detail-image"><img src={product.image} alt={`${product.name} tējas iepakojums`} /></div>{product.images.slice(1, 3).map((src, i) => <div className={`detail-image detail-image-wide${i === 0 ? ' detail-image-banner' : ''}`} key={src}><img src={src} alt={`${product.name} — attēls ${i + 2}`} loading="lazy" /></div>)}<div className="detail-image-row">{product.images.slice(3, 5).map((src, i) => <div className="detail-image" key={src}><img src={src} alt={`${product.name} — attēls ${i + 4}`} loading="lazy" /></div>)}</div></div><div className="detail-copy"><span className="eyebrow">{product.collection}</span><h1>{product.name}</h1><div className="detail-price"><PriceTag item={product} /></div>{!pricesReady && !pricesLoading && <PriceUnavailableNotice />}<p className="detail-description">{product.description}</p><div className="detail-info"><div><span className="eyebrow">SASTĀVS</span><p>{product.ingredients}</p><p><strong>Pagatavošana:</strong> Vienu tējas pogu ievieto 400 ml kanniņā, pārlej ar 90 °C karstu ūdeni un ļauj ievilkties 5 minūtes.</p></div></div><div className="purchase-row"><div className="quantity"><button onClick={() => setQuantity(Math.max(1, quantity - 1))} aria-label="Samazināt daudzumu"><Minus size={15} /></button><span>{quantity}</span><button onClick={() => setQuantity(quantity + 1)} aria-label="Palielināt daudzumu"><Plus size={15} /></button></div><AddButton product={product} quantity={quantity} /></div></div><div className="related"><div className="section-heading"><span className="eyebrow">VARĒTU PATIKT ARĪ</span><span className="line" /></div><div className="product-grid">{products.filter((item) => item.id !== product.id).map((item) => <ProductCard product={item} key={item.id} />)}</div></div></main>;
}

function Cart() {
  const { items, subtotal, change, remove, pricesReady, stockOk } = useCart(); const navigate = useNavigate(); const freeShipping = pricesReady && subtotal > 40;
  return <main className="cart-page container"><div className="page-title"><span className="eyebrow">GROZIŅŠ</span><h1>Tavs groziņš</h1></div>{items.length === 0 ? <div className="empty-state"><p>Tavs groziņš šobrīd ir tukšs.</p><Link className="button button-dark" to="/kolekcijas/stihijas">Apskatīt tējas</Link></div> : <div className="cart-layout"><div className="cart-items">{items.map((item) => <div className="cart-item" key={item.id}><img src={item.image} alt="" /><div className="cart-item-info"><span className="eyebrow">{item.collection}</span><h3>{item.name}</h3><span><PriceTag item={item} /></span>{!item.inStock && <span className="stock-warning">Nav noliktavā — noņem no groziņa, lai turpinātu</span>}<div className="quantity"><button onClick={() => change(item.id, -1)} aria-label="Samazināt daudzumu"><Minus size={14} /></button><span>{item.quantity}</span><button onClick={() => change(item.id, 1)} aria-label="Palielināt daudzumu"><Plus size={14} /></button></div></div><button className="remove-button" onClick={() => remove(item.id)} aria-label={`Noņemt ${item.name}`}><X size={16} /></button></div>)}</div><aside className="summary"><span className="eyebrow">PASŪTĪJUMA KOPSAVILKUMS</span><div><span>Preces</span><span>{pricesReady ? `${subtotal.toFixed(2)} €` : '—'}</span></div><div><span>Piegāde</span><span>{freeShipping ? 'Bezmaksas' : 'Tiks aprēķināta'}</span></div><div className="summary-total"><b>{freeShipping ? 'Kopā' : 'Kopā bez piegādes'}</b><b>{pricesReady ? `${subtotal.toFixed(2)} €` : '—'}</b></div>{!pricesReady && <PriceUnavailableNotice />}<button className="button button-dark full-width" disabled={!pricesReady || !stockOk} onClick={() => navigate('/checkout')}>Noformēt pasūtījumu <ArrowRight size={16} /></button><small>{freeShipping ? 'Bezmaksas piegāde.' : 'Piegādes maksa tiks parādīta noformēšanas laikā.'} Bezmaksas piegāde pasūtījumiem virs 40 €.</small></aside></div>}</main>;
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

function LockerSelect({ options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = React.useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const query = search.trim().toLocaleLowerCase('lv');
  const matches = options.filter((option) => [option.label, option.address, option.city].some((item) => item?.toLocaleLowerCase('lv').includes(query)));
  const selected = options.find((option) => option.id === value);
  const choose = (id) => { onChange(id); setOpen(false); setSearch(''); };
  return (
    <div className="locker-select" ref={rootRef} onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}>
      <span className="locker-label">Pakomāts / piegādes vieta</span>
      <input className="locker-validity" name="deliveryLocation" value={value} required tabIndex={-1} aria-hidden="true" onChange={() => {}} onFocus={() => setOpen(true)} />
      <button type="button" className="locker-trigger" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <span className={selected ? '' : 'placeholder'}>{selected ? selected.label : 'Izvēlies pakomātu'}</span>
      </button>
      {open && (
        <div className="locker-panel">
          <input type="search" autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Meklēt: nosaukums, adrese vai pilsēta" />
          <ul role="listbox">
            {matches.map((option) => (
              <li key={option.id} role="option" aria-selected={option.id === value} className={option.id === value ? 'active' : ''} onClick={() => choose(option.id)}>
                {option.label}{option.address && option.address !== option.label ? ` — ${option.address}` : ''}
              </li>
            ))}
            {matches.length === 0 && <li className="empty">Pēc šī meklējuma pakomāti netika atrasti.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
function Checkout() {
  const { items, subtotal, pricesReady, stockOk } = useCart();
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [countries, setCountries] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState('');
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [loadingShippingOptions, setLoadingShippingOptions] = useState(false);
  const [loadingLockers, setLoadingLockers] = useState(false);
  const [shippingError, setShippingError] = useState('');
  const [lockerError, setLockerError] = useState('');
  const [shippingOptions, setShippingOptions] = useState([]);
  const [lockers, setLockers] = useState([]);
  const [selectedLocker, setSelectedLocker] = useState('');
  const [shippingRate, setShippingRate] = useState(null);
  const [loadingShippingRate, setLoadingShippingRate] = useState(false);
  const [shippingRateError, setShippingRateError] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState('');
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const selectedOption = shippingOptions.find((option) => option.id === deliveryMethod);
  const isPickup = selectedOption?.type ? selectedOption.type === 'pickuppoint' : deliveryMethod === 'pakomats';
  const isCourier = selectedOption?.type ? selectedOption.type === 'courier' : deliveryMethod === 'kurjers';
  const usesLockerPicker = selectedOption?.type === 'pickuppoint';
  const freeShipping = pricesReady && subtotal > 40;
  const currentShippingRate = shippingRate?.method === deliveryMethod
    && shippingRate?.parcelshop === selectedLocker
    && shippingRate?.country === selectedCountry
    && shippingRate?.itemCount === itemCount
    ? shippingRate
    : null;
  const shippingPrice = currentShippingRate?.price ?? selectedOption?.price;
  const shipping = freeShipping || !selectedOption || shippingPrice === undefined ? 0 : Number(shippingPrice);
  useEffect(() => {
    let active = true;
    getShippingCountries()
      .then((optionsResponse) => {
        if (!active) return;
        const availableCountries = Array.isArray(optionsResponse) ? optionsResponse.filter((country) => country?.code && country?.name) : [];
        setCountries(availableCountries);
        setSelectedCountry((current) => availableCountries.some((country) => country.code === current) ? current : availableCountries[0]?.code || '');
        if (!availableCountries.length) setShippingError('Piegādes valstis nav konfigurētas.');
      })
      .catch((requestError) => {
        if (active) setShippingError(requestError.message);
      })
      .finally(() => { if (active) setLoadingCountries(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!selectedCountry) {
      setShippingOptions([]);
      setDeliveryMethod('');
      setLoadingShippingOptions(false);
      return undefined;
    }
    let active = true;
    setShippingOptions([]);
    setDeliveryMethod('');
    setShippingError('');
    setLoadingShippingOptions(true);
    getShippingOptions(itemCount, selectedCountry)
      .then((optionsResponse) => {
        if (!active) return;
        const options = Array.isArray(optionsResponse) ? optionsResponse : optionsResponse?.options || optionsResponse?.data || [];
        const availableOptions = options.filter((option) => option?.id && option?.name);
        setShippingOptions(availableOptions);
        setDeliveryMethod(availableOptions[0]?.id || '');
        if (!availableOptions.length) setShippingError('Šai valstij pašlaik nav pieejamu piegādes veidu.');
      })
      .catch((requestError) => {
        if (active) setShippingError(requestError.message);
      })
      .finally(() => { if (active) setLoadingShippingOptions(false); });
    return () => { active = false; };
  }, [itemCount, selectedCountry]);
  useEffect(() => {
    setSelectedLocker('');
    setLockerError('');
    setShippingRate(null);
    setShippingRateError('');
    if (!usesLockerPicker || loadingShippingOptions || !selectedCountry) {
      setLockers([]);
      setLoadingLockers(false);
      return undefined;
    }
    let active = true;
    setLockers([]);
    setLoadingLockers(true);
    getParcelLockers(deliveryMethod, selectedCountry)
      .then((lockersResponse) => {
        if (!active) return;
        const lockerList = Array.isArray(lockersResponse) ? lockersResponse : lockersResponse?.lockers || lockersResponse?.data || [];
        const availableLockers = lockerList.filter((locker) => locker?.id && (locker.name || locker.label || locker.address));
        setLockers(availableLockers);
        if (!availableLockers.length) setLockerError('Šim pārvadātājam šajā valstī nav pieejamu pakomātu.');
      })
      .catch((requestError) => {
        if (active) setLockerError(requestError.message);
      })
      .finally(() => { if (active) setLoadingLockers(false); });
    return () => { active = false; };
  }, [deliveryMethod, loadingShippingOptions, selectedCountry, usesLockerPicker]);
  useEffect(() => {
    if (!usesLockerPicker || !selectedLocker || loadingLockers) {
      setLoadingShippingRate(false);
      setShippingRateError('');
      return undefined;
    }
    let active = true;
    setShippingRate(null);
    setShippingRateError('');
    setLoadingShippingRate(true);
    getShippingOptions(itemCount, selectedCountry, deliveryMethod, selectedLocker)
      .then((rateResponse) => {
        if (!active) return;
        const rates = Array.isArray(rateResponse) ? rateResponse : rateResponse?.options || rateResponse?.data || [];
        const rate = rates.find((option) => option?.id === deliveryMethod && Number.isFinite(Number(option.price)));
        if (!rate) {
          setShippingRateError('Šim pakomātam neizdevās iegūt piegādes cenu.');
          return;
        }
        setShippingRate({
          method: deliveryMethod,
          parcelshop: selectedLocker,
          country: selectedCountry,
          itemCount,
          price: Number(rate.price),
        });
      })
      .catch((requestError) => {
        if (active) setShippingRateError(requestError.message);
      })
      .finally(() => { if (active) setLoadingShippingRate(false); });
    return () => { active = false; };
  }, [deliveryMethod, itemCount, loadingLockers, selectedCountry, selectedLocker, usesLockerPicker]);
  if (!items.length) return <main className="page container empty-state"><h1>Groziņš ir tukšs</h1><Link className="button button-dark" to="/kolekcijas/stihijas">Apskatīt tējas</Link></main>;
  const deliveryOptions = lockers.map((locker) => ({ id: locker.id, label: locker.name || locker.label || locker.address, address: locker.address, city: locker.city, postcode: locker.postcode }));
  const selectedDeliveryLocation = deliveryOptions.find((option) => option.id === selectedLocker);
  const shippingReady = Boolean(selectedCountry && selectedOption && !loadingCountries && !loadingShippingOptions
    && Number.isFinite(Number(shippingPrice))
    && (!usesLockerPicker || (!loadingLockers && !loadingShippingRate && !shippingRateError && lockers.length > 0 && selectedLocker)));
  const submitOrder = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setError('');
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    try {
      const values = Object.fromEntries(form.entries());
      const address = isCourier
        ? { street: values.street?.trim(), city: values.city?.trim(), postcode: values.postcode?.trim() }
        : isPickup && selectedDeliveryLocation
          ? { street: selectedDeliveryLocation.address || selectedDeliveryLocation.label, city: selectedDeliveryLocation.city, postcode: selectedDeliveryLocation.postcode }
          : undefined;
      const location = isCourier
        ? `${address.street}, ${address.city}, ${address.postcode}`
        : isPickup && selectedDeliveryLocation
          ? selectedLocker
          : values.deliveryLocation;
      const payment = await createPaymentSession({
        customer: { firstName: values.firstName, lastName: values.lastName, email: values.email, phone: values.phone },
        delivery: {
          method: values.deliveryMethod,
          country: values.country,
          location,
          address,
          locationLabel: selectedDeliveryLocation?.label || location,
          cost: shipping,
        },
        termsAccepted: values.consentAccepted === 'on',
        privacyAccepted: values.consentAccepted === 'on',
        items: items.map((item) => ({
          productId: item.woocommerceId ?? baseProducts.find((product) => product.id === item.id)?.woocommerceId,
          quantity: item.quantity,
        })),
        total: subtotal + shipping,
      });
      if (payment.checkoutUrl) { window.location.assign(payment.checkoutUrl); return; }
      setSubmitted(true);
      setSubmitting(false);
    } catch (requestError) {
      setError(requestError.message);
      setSubmitting(false);
    }
  };
  return <main className="checkout-page container">
    <div className="page-title"><span className="eyebrow">NOFORMĒT PASŪTĪJUMU</span><h1>Tava informācija</h1></div>
    {submitted ? <div className="success-message"><Check size={26} /><h2>Pasūtījums izveidots</h2><p>Maksājuma sesija ir izveidota serverī. Pasūtījums tiks atzīmēts kā apmaksāts tikai pēc droša maksājumu nodrošinātāja apstiprinājuma.</p><Link to="/" className="button button-dark">Atgriezties sākumā</Link></div> : <form className="checkout-layout" onSubmit={submitOrder}>
      <div className="checkout-fields">
        <fieldset>
          <legend>Kontakti</legend>
          <div className="field-grid"><label>Vārds<input required name="firstName" /></label><label>Uzvārds<input required name="lastName" /></label></div>
          <label>E-pasts<input required type="email" name="email" /></label>
          <label>Tālrunis<input required type="tel" name="phone" /></label>
        </fieldset>
        <fieldset>
          <legend>Piegāde</legend>
          <label>Valsts
            <select name="country" required value={selectedCountry} disabled={loadingCountries || !countries.length} onChange={(event) => setSelectedCountry(event.target.value)}>
              {loadingCountries && <option value="">Ielādē valstis…</option>}
              {!loadingCountries && !countries.length && <option value="">Valstis nav pieejamas</option>}
              {countries.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}
            </select>
          </label>
          <label>Piegādes veids
            <select name="deliveryMethod" required value={deliveryMethod} disabled={loadingCountries || loadingShippingOptions || !shippingOptions.length} onChange={(event) => setDeliveryMethod(event.target.value)}>
              {loadingCountries || loadingShippingOptions ? <option value="">Ielādē piegādes veidus…</option> : shippingOptions.map((option) => {
                const price = option.id === deliveryMethod ? shippingPrice : option.price;
                const priceLabel = freeShipping ? 'Bezmaksas' : Number.isFinite(Number(price)) ? `${Number(price).toFixed(2)} €` : 'Izvēlies pakomātu';
                return <option value={option.id} key={option.id}>{option.name} — {priceLabel}</option>;
              })}
            </select>
          </label>
          {shippingError && <p className="form-error" role="alert">{shippingError}</p>}
          {loadingLockers && <p role="status">Ielādē pakomātus…</p>}
          {lockerError && <p className="form-error" role="alert">{lockerError}</p>}
          {loadingShippingRate && <p role="status">Ielādē Swotzy piegādes cenu…</p>}
          {shippingRateError && <p className="form-error" role="alert">{shippingRateError}</p>}
          {usesLockerPicker && deliveryOptions.length > 0
            ? <LockerSelect options={deliveryOptions} value={selectedLocker} onChange={setSelectedLocker} />
            : usesLockerPicker
              ? null
            : isCourier
              ? <>
                <label>Iela, mājas / dzīvokļa nr.<input required name="street" autoComplete="address-line1" /></label>
                <div className="field-grid">
                  <label>Pilsēta / novads<input required name="city" autoComplete="address-level2" /></label>
                  <label>Pasta indekss<input required name="postcode" autoComplete="postal-code" placeholder="Pasta indekss" pattern="[\p{L}0-9][\p{L}0-9 -]{1,11}" title="Ievadi derīgu pasta indeksu" /></label>
                </div>
              </>
              : !isPickup && selectedOption && <label>Pakomāts / piegādes vieta<input required name="deliveryLocation" placeholder="Ievadi piegādes vietu" /></label>}
        </fieldset>
        <fieldset className="consent-fieldset">
          <legend>Piekrišana</legend>
          <label className="consent-label"><input required type="checkbox" name="consentAccepted" /> Piekrītu <Link to="/noteikumi" target="_blank">lietošanas noteikumiem</Link> un <Link to="/privatuma-politika" target="_blank">privātuma politikai</Link>.</label>
        </fieldset>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-dark payment-button" type="submit" disabled={submitting || !shippingReady || !pricesReady || !stockOk}>Maksāt <ArrowRight size={16} /></button>
        <p className="form-note">Maksājumi tiek apstrādāti MakeCommerce platformā. Norēķinu valūta ir EUR. Karte un maksājumu dati netiek glabāti šajā vietnē.</p>
      </div>
      <aside className="summary">
        <span className="eyebrow">TAVS PASŪTĪJUMS</span>
        {items.map((item) => <div className="summary-product" key={item.id}><span>{item.name} × {item.quantity}</span>        <span>{item.price === null ? '—' : `${(item.price * item.quantity).toFixed(2)} €`}</span></div>)}
        <div><span>Piegāde</span><span>{freeShipping ? 'Bezmaksas' : Number.isFinite(Number(shippingPrice)) ? `${shipping.toFixed(2)} €` : '—'}</span></div>
                <div className="summary-total"><b>Kopā</b><b>{pricesReady ? `${(subtotal + shipping).toFixed(2)} €` : '—'}</b></div>
                {!pricesReady && <PriceUnavailableNotice />}
        {!stockOk && <p className="price-notice" role="alert">Kāda prece groziņā nav noliktavā. Lūdzu, noņem to no groziņa.</p>}
      </aside>
    </form>}
    {submitting && <div className="loading-overlay" role="alert" aria-busy="true" aria-live="assertive"><div className="spinner" /><p>Notiek pāradresācija uz maksājumu…</p></div>}
  </main>;
}

function PaymentResult() {
  const { clear } = useContext(CartContext);
  const [params] = useSearchParams();
  const status = params.get('status');
  useEffect(() => { if (status === 'success') clear?.(); }, [status]);
  const text = {
    success: ['Paldies! Maksājums saņemts', 'Tavs pasūtījums ir apmaksāts. Apstiprinājums tiks nosūtīts uz e-pastu.'],
    cancelled: ['Maksājums atcelts', 'Maksājums netika veikts. Vari mēģināt vēlreiz.'],
    pending: ['Maksājums tiek apstrādāts', 'Mēs pārbaudām maksājuma statusu. Apstiprinājumu saņemsi e-pastā.'],
  }[status] || ['Maksājums neizdevās', 'Neizdevās apstiprināt maksājumu. Lūdzu, mēģini vēlreiz.'];
  return <main className="checkout-page container"><div className="success-message"><Check size={26} /><h2>{text[0]}</h2><p>{text[1]}</p><Link to={status === 'success' ? '/' : '/checkout'} className="button button-dark">{status === 'success' ? 'Atgriezties sākumā' : 'Atpakaļ uz pasūtījumu'}</Link></div></main>;
}

function ShippingSetup() {
  const [token, setToken] = useState('');
  const [managerUrl, setManagerUrl] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const result = await setupMakeCommerceShipping(token);
      if (typeof result?.managerUrl !== 'string') throw new Error('Iestatīšanas saite netika saņemta.');
      setManagerUrl(result.managerUrl);
      setToken('');
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return <main className="page container">
    <div className="page-title"><span className="eyebrow">MAKECOMMERCE</span><h1>Piegādes iestatīšana</h1></div>
    <div className="checkout-fields">
      <p>Šī lapa izveido drošu MakeCommerce Shipping Manager sesiju veikala konfigurēšanai. Iestatīšanas tokenu ievadiet tikai šeit.</p>
      {!managerUrl ? <form onSubmit={submit}>
        <label>Iestatīšanas tokens<input required type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-dark" type="submit" disabled={submitting}>{submitting ? 'Veido saiti…' : 'Atvērt Shipping Manager'}</button>
      </form> : <div className="success-message">
        <p>Atver saiti, saglabā sūtītāja adresi un pieejamos pārvadātājus, pēc tam atgriezies veikalā un atkārtoti ielādē checkout.</p>
        <a className="button button-dark" href={managerUrl} target="_blank" rel="noopener noreferrer">Atvērt MakeCommerce Shipping Manager</a>
      </div>}
    </div>
  </main>;
}

const defaultDescription = 'CHAI AND CITY — dabīgas, rūpīgi sagatavotas tējas no Latvijas. Pasūti tiešsaistē ar piegādi uz pakomātu vai kurjeru.';
function setMeta(selector, value) {
  document.querySelector(selector)?.setAttribute('content', value);
}

function App() { const location = useLocation(); useEffect(() => { window.scrollTo(0, 0); const pageTitle = location.pathname === '/' ? 'No dabas līdz tavām mājām' : location.pathname === '/kolekcijas' ? 'Kolekcijas' : location.pathname === '/kolekcijas/stihijas' ? 'STIHIJAS' : location.pathname.includes('checkout') ? 'Noformēt pasūtījumu' : location.pathname.includes('noteikumi') ? 'Lietošanas noteikumi' : location.pathname.includes('privatuma-politika') ? 'Privātuma politika' : location.pathname.includes('shipping-setup') ? 'Piegādes iestatīšana' : 'Tējas'; const product = location.pathname.startsWith('/produkti/') ? baseProducts.find((item) => item.id === location.pathname.split('/')[2]) : null; const titleText = product ? product.name : pageTitle; document.title = `CHAI AND CITY — ${titleText}`; const noindex = ['/checkout', '/grozins', '/maksajums', '/shipping-setup'].includes(location.pathname); const descriptions = { '/': defaultDescription, '/kolekcijas': 'Chai and City tējas kolekcijas — dabīgas, rūpīgi sagatavotas tējas no Latvijas.', '/kolekcijas/stihijas': 'STIHIJAS kolekcija — četras dabīgas tējas kompozīcijas: uguns, ūdens, zeme un gaiss.' }; const description = product ? `${product.name} — ${product.description}` : descriptions[location.pathname] || defaultDescription; setMeta('meta[name="description"]', description); setMeta('meta[name="robots"]', noindex ? 'noindex, nofollow' : 'index, follow'); setMeta('meta[property="og:title"]', document.title); setMeta('meta[property="og:description"]', description); if (product) setMeta('meta[property="og:image"]', product.image); }, [location.pathname]); return <><Header /><Routes><Route path="/" element={<Home />} /><Route path="/kolekcijas" element={<Collections />} /><Route path="/kolekcijas/stihijas" element={<ElementsCollection />} /><Route path="/produkti/:id" element={<ProductDetail />} /><Route path="/grozins" element={<Cart />} /><Route path="/checkout" element={<Checkout />} /><Route path="/maksajums" element={<PaymentResult />} /><Route path="/shipping-setup" element={<ShippingSetup />} /><Route path="/noteikumi" element={<LegalPage type="terms" />} /><Route path="/privatuma-politika" element={<LegalPage type="privacy" />} /></Routes><footer className="site-footer"><div><span className="brand">CHAI AND CITY</span><p>{merchant.name} · Reģ. Nr. {merchant.registrationNumber}<br />{merchant.address}<br /><a href={`mailto:${merchant.email}`}>{merchant.email}</a> · <a href={`tel:${merchant.phone.replace(/\s/g, '')}`}>{merchant.phone}</a></p></div><nav className="footer-links" aria-label="Juridiskā informācija"><Link to="/noteikumi">Lietošanas noteikumi</Link><Link to="/privatuma-politika">Privātuma politika</Link></nav><div className="footer-meta"><a className="footer-social" href="https://www.instagram.com/chaiandcity/" target="_blank" rel="noopener noreferrer" aria-label="Instagram"><Instagram size={18} /></a><span>Ražots Latvijā · © 2026</span></div></footer></>; }

createRoot(document.getElementById('root')).render(<HashRouter><CartProvider><App /></CartProvider></HashRouter>);
