/* App shell — wires Home + detail pages with simple route state */

const { useState: useStateA, useEffect: useEffectA } = React;

function App(){
  const [lang, setLang] = useStateA(()=>localStorage.getItem('cgs.lang')||'en');
  const [route, setRoute] = useStateA(()=>localStorage.getItem('cgs.route')||'home');
  const [query, setQuery] = useStateA('');

  useEffectA(()=>localStorage.setItem('cgs.lang', lang), [lang]);
  useEffectA(()=>localStorage.setItem('cgs.route', route), [route]);
  useEffectA(()=>{ document.documentElement.dir = lang==='ckb' ? 'rtl' : 'ltr'; document.body.dir = lang==='ckb'?'rtl':'ltr'; }, [lang]);

  const back = ()=>setRoute('home');

  let content;
  if (route==='home') content = <Home lang={lang} query={query} activeId={'restaurant_info'} onOpen={setRoute} />;
  else if (route==='restaurant_info') content = <RestaurantInfoPage lang={lang} onBack={back}/>;
  else if (route==='preference') content = <PreferencePage lang={lang} onBack={back}/>;
  else if (route==='users') content = <UsersPage lang={lang} onBack={back}/>;
  else if (route==='receipt') content = <ReceiptPage lang={lang} onBack={back}/>;
  else if (route==='device') content = <DevicePage lang={lang} onBack={back}/>;
  else if (route==='whatsapp') content = <WhatsappPage lang={lang} onBack={back}/>;
  else content = <GenericPage id={route} lang={lang} onBack={back}/>;

  return (
    <div className="relative min-h-screen">
      <Backdrop/>
      <div className="relative z-10">
        <TopBar lang={lang} setLang={setLang} query={query} setQuery={setQuery} />
        <div key={route+lang} className="panel-enter">{content}</div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
