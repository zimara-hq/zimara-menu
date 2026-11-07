import {lang,makeT,topbar} from './common.js';
// Privacy notice (PDPL), terms (E-Commerce Law), cancellation and the subscriber data
// processing terms. Arabic is the governing text. Legal identity comes from /api/legal and
// is never invented: a missing field is shown as "being issued".
const a=(ar,en)=>lang==='ar'?ar:en;
const e=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const VERSION='2026-11-07';
topbar(document.querySelector('#top'),makeT({ar:{title:'السياسات والشروط'},en:{title:'Policies and terms'}}));
const list=items=>`<ul>${items.map(([ar,en])=>`<li>${a(ar,en)}</li>`).join('')}</ul>`;
const p=(ar,en)=>`<p>${a(ar,en)}</p>`;
const sections=[
 ['identity',a('من نحن','Who we are'),p('«زيمارا منيو» خدمة رقمية تقدمها زيمارا للمنشآت (مطاعم، مقاهي، عيادات وغيرها): منيو إلكتروني، نداء العملاء، قائمة انتظار، وبطاقات ولاء. بيانات المنشأة النظامية تظهر أدناه.','ZIMARA Menu is a digital service provided by ZIMARA to businesses (restaurants, cafes, clinics and others): digital menus, customer calling, waitlists and loyalty cards. Our registered details are shown below.')+'<div id="legal-id"></div>'],
 ['privacy',a('سياسة الخصوصية','Privacy notice'),
  p('نلتزم بنظام حماية البيانات الشخصية في المملكة العربية السعودية ولوائحه. توضح هذه السياسة ما نجمعه، ولماذا، ومدة حفظه، وحقوقك.','We comply with the Saudi Personal Data Protection Law (PDPL) and its regulations. This notice explains what we collect, why, how long we keep it and your rights.')
  +`<h3>${a('دورنا','Our role')}</h3>`+list([
   ['لبيانات حسابات المشتركين وموظفيهم: زيمارا «جهة تحكم».','For subscriber and staff account data, ZIMARA is the controller.'],
   ['لبيانات عملاء المنشأة (الطلب، النداء، الانتظار، الولاء): المنشأة هي «جهة التحكم» وزيمارا «جهة معالجة» تعمل بتعليماتها فقط.','For a business’s guests (orders, calls, waitlist, loyalty) the business is the controller and ZIMARA processes the data only on its instructions.'],
  ])
  +`<h3>${a('ما نجمعه ولماذا','What we collect and why')}</h3>`+list([
   ['حساب المشترك: الاسم، البريد، كلمة مرور مشفّرة، بيانات المنشأة والفوترة. لتقديم الخدمة وإصدار الفواتير (تنفيذ العقد والالتزام النظامي).','Subscriber account: name, email, hashed password, business and billing details, to provide the service and issue invoices (contract and legal obligation).'],
   ['النداء: رقم الطلب فقط. لا نطلب اسمًا ولا رقم جوال.','Pager: the order number only. No name or phone is required.'],
   ['الطلبات وقائمة الانتظار: الاسم والجوال والعنوان عند التوصيل أو الحجز فقط، لتنفيذ طلبك.','Orders and waitlist: name, phone and address only for delivery or waitlist, to fulfil your request.'],
   ['بطاقة الولاء: رمز البطاقة وسجل الأختام. لا نطلب اسمًا أو جوالًا.','Loyalty card: the card code and stamp history. No name or phone is required.'],
   ['الإشعارات: عنوان اشتراك الإشعار في متصفحك، بعد موافقتك فقط.','Notifications: your browser’s push subscription address, only after you agree.'],
   ['أدوات القياس الإعلانية للمنشأة: لا تعمل إلا بعد موافقتك الصريحة في صفحة المنيو.','A business’s ad measurement tools run only after your explicit consent on its menu page.'],
   ['ملفات الارتباط: ملف جلسة آمن للدخول، وتخزين محلي للغة والمظهر. لا نستخدم ملفات تتبع إعلانية خاصة بنا.','Cookies: a secure session cookie for sign-in and local storage for language and theme. We use no advertising trackers of our own.'],
  ])
  +`<h3>${a('مدة الحفظ','Retention')}</h3>`+list([
   ['تذكرة النداء تنتهي خلال 12 ساعة.','A pager ticket expires within 12 hours.'],
   ['الاسم والجوال والعنوان في الطلبات وقائمة الانتظار، وتعليقات التقييم، تُحذف تلقائيًا بعد 90 يومًا.','Names, phones and addresses in orders and the waitlist, and rating comments, are erased automatically after 90 days.'],
   ['بيانات الحساب تبقى ما دام الاشتراك قائمًا، ثم تُحذف عند طلب حذف المنشأة.','Account data is kept while the subscription is active and erased when the business requests deletion.'],
   ['الفواتير وسجلات الدفع وسجل الأمان تبقى المدة التي يلزم بها النظام (الدفاتر التجارية والزكاة والضريبة).','Invoices, payment records and the security log are kept for the period required by law (commercial books, zakat and tax).'],
  ])
  +`<h3>${a('من يعالج البيانات معنا','Who processes data with us')}</h3>`+p('نستعين بمزودين يلتزمون بحماية البيانات، ولا نبيع البيانات الشخصية لأي جهة:','We use providers bound to protect data, and we never sell personal data:')+list([
   ['Cloudflare: الاستضافة وقاعدة البيانات، بخوادم قد تكون خارج المملكة.','Cloudflare: hosting and database, on servers that may be outside the Kingdom.'],
   ['ميسر: بوابة دفع مرخّصة من البنك المركزي السعودي. لا نخزّن بيانات البطاقات.','Moyasar: a SAMA-licensed payment gateway. We never store card data.'],
   ['Simple Fatoora: إصدار الفواتير الإلكترونية.','Simple Fatoora: electronic invoicing.'],
   ['Resend: إرسال رسائل البريد للحساب والفواتير.','Resend: account and invoice emails.'],
   ['Anthropic: قراءة صور المنيو التي يرفعها المشترك لاستخراج الأصناف، عند استخدام هذه الميزة فقط.','Anthropic: reading menu photos a subscriber uploads to extract items, only when that feature is used.'],
   ['Apple وGoogle: الإشعارات وبطاقات المحفظة عند تفعيلها.','Apple and Google: push notifications and wallet passes when enabled.'],
   ['Telegram ونقاط البيع (رواء وغيرها): فقط إذا ربطها المشترك بنفسه.','Telegram and point-of-sale systems (Rewaa and others): only if the subscriber connects them.'],
  ])+p('قد تُنقل بعض البيانات خارج المملكة لهؤلاء المزودين وفق لائحة نقل البيانات الشخصية خارج المملكة، وبضمانات تعاقدية مناسبة.','Some data may be transferred outside the Kingdom to these providers under the Regulation on Personal Data Transfer, with appropriate contractual safeguards.')
  +`<h3>${a('حقوقك','Your rights')}</h3>`+list([
   ['أن تعرف كيف تُعالج بياناتك، وأن تطلع عليها وتحصل على نسخة منها.','To know how your data is processed, access it and obtain a copy.'],
   ['أن تصححها أو تكملها.','To correct or complete it.'],
   ['أن تطلب إتلافها عند انتهاء الحاجة إليها.','To request its destruction when it is no longer needed.'],
   ['أن تسحب موافقتك في أي وقت، مثل إيقاف رسائل العروض من بطاقة الولاء.','To withdraw consent at any time, for example by stopping offer messages from your loyalty card.'],
   ['أن تقدم شكوى إلى الهيئة السعودية للبيانات والذكاء الاصطناعي (سدايا).','To complain to the Saudi Data and AI Authority (SDAIA).'],
  ])+p('عملاء المنشأة يوجّهون طلباتهم للمنشأة أولًا، ونساعدها على تنفيذها. المشترك يصدّر بياناته ويطلب حذف منشأته من «بيانات منشأتك» في اللوحة أو التطبيق. نرد على الطلبات خلال 30 يومًا.','A business’s guests contact the business first, and we help it respond. Subscribers export their data and request deletion from “Your business data” in the dashboard or app. We answer requests within 30 days.')
  +`<h3>${a('الأمان والتسريب','Security and breaches')}</h3>`+p('نشفّر الاتصال، ونشتق كلمات المرور تشفيريًا، ونفعّل التحقق بخطوتين وتسجيل الدخول بمفتاح المرور. عند أي تسريب نقيّم أثره، ونبلّغ سدايا خلال 72 ساعة والمتأثرين متى انطبقت شروط الإبلاغ.','We encrypt connections, derive passwords cryptographically, and offer two-step verification and passkeys. If a breach occurs we assess its impact and notify SDAIA within 72 hours, and the people affected, whenever the reporting criteria apply.')
  +`<h3>${a('الأطفال','Children')}</h3>`+p('الخدمة للمنشآت. لا نجمع عمدًا بيانات من هم دون 18 عامًا.','The service is for businesses. We do not knowingly collect data from anyone under 18.')],
 ['terms',a('الشروط والأحكام','Terms of service'),
  list([
   ['التسجيل يعني قبول هذه الشروط وسياسة الخصوصية. النص العربي هو المعتمد.','Signing up means accepting these terms and the privacy notice. The Arabic text governs.'],
   ['التجربة المجانية 14 يومًا، بدون بطاقة دفع، ولا تتحول لاشتراك مدفوع تلقائيًا.','The free trial lasts 14 days, needs no payment card and never turns into a paid plan automatically.'],
   ['السعر المعروض في صفحة الباقات هو المبلغ النهائي بالريال السعودي بدون رسوم مخفية. زيمارا غير مسجلة حاليًا في ضريبة القيمة المضافة، فلا تُضاف ضريبة. عند التسجيل نعرض الأسعار شاملة الضريبة مع الرقم الضريبي.','The price on the plans page is the final amount in Saudi riyals with no hidden fees. ZIMARA is not currently VAT-registered, so no VAT is added. Once registered, prices will be shown VAT-inclusive with our VAT number.'],
   ['الدفع عبر بوابة مرخّصة. يتفعّل الاشتراك بعد تأكيد الدفع من البوابة، وتصلك فاتورة بالبريد.','Payment is through a licensed gateway. The plan activates once the gateway confirms payment, and an invoice is emailed to you.'],
   ['لا يوجد خصم تلقائي. نذكّرك بالبريد قبل نهاية المدة، ولا يتجدد الاشتراك إلا بدفعك.','There are no automatic charges. We remind you by email before the period ends, and the plan renews only when you pay.'],
   ['المشترك مسؤول عن صحة منيوه: الأسعار شاملة الضريبة إن كان مسجلًا فيها، والسعرات الحرارية ومسببات الحساسية حسب اشتراطات هيئة الغذاء والدواء.','The subscriber is responsible for its menu: prices including VAT if it is VAT-registered, and calories and allergens as required by the SFDA.'],
   ['المشترك مسؤول عن بيانات عملائه بصفته جهة تحكم، ولا يرسل رسائل تسويقية إلا لمن وافق عليها.','The subscriber is the controller of its guests’ data and sends marketing messages only to people who agreed to receive them.'],
   ['رابط تقييم قوقل يظهر لكل العملاء. يُمنع ربط مكافأة أو ختم بالتقييم.','The Google review link is shown to every guest. Rewards or stamps for reviews are not allowed.'],
   ['ألعاب الانتظار للتسلية فقط وبدون جوائز.','Waiting games are for fun only and offer no prizes.'],
   ['يُمنع استخدام الخدمة لمحتوى مخالف للأنظمة أو مضلل، أو لمنتجات محظورة.','The service may not be used for unlawful or misleading content or prohibited products.'],
   ['تخضع هذه الشروط لأنظمة المملكة العربية السعودية، وتختص المحاكم السعودية بأي نزاع.','These terms are governed by the laws of the Kingdom of Saudi Arabia, and Saudi courts have jurisdiction over any dispute.'],
  ])],
 ['cancellation',a('الإلغاء والاسترداد','Cancellation and refunds'),
  list([
   ['تلغي التجديد في أي وقت من «باقتي». يستمر الاشتراك حتى نهاية المدة المدفوعة، ثم تبقى بياناتك للعرض والتصدير.','Cancel renewal any time from My plan. The plan runs to the end of the paid period, then your data stays available to view and export.'],
   ['إذا تعذّر تقديم الخدمة المدفوعة بسبب منّا، نرد المبلغ عن المدة المتبقية بنفس وسيلة الدفع.','If we cannot provide the paid service for reasons on our side, we refund the remaining period by the original payment method.'],
   ['للشكاوى والاسترداد راسل الدعم المذكور في «من نحن». ويحق لك التواصل مع وزارة التجارة على 1900.','For complaints and refunds write to the support contact under “Who we are”. You may also contact the Ministry of Commerce on 1900.'],
  ])],
 ['delete-account',a('حذف الحساب','Deleting your account'),
  list([
   ['من «بيانات منشأتك» في اللوحة أو التطبيق: اكتب DELETE ORGANIZATION وكلمة المرور.','From “Your business data” in the dashboard or app: type DELETE ORGANIZATION and your password.'],
   ['يمكنك التراجع خلال 14 يومًا. بعدها تُحذف المنيو والفروع والعملاء والحسابات نهائيًا وتلقائيًا.','You can cancel within 14 days. After that the menus, branches, guests and accounts are erased permanently and automatically.'],
   ['نُبقي الفواتير وسجلات الدفع فقط للمدة التي يلزم بها النظام.','We keep only invoices and payment records for the period the law requires.'],
   ['عميل المنشأة يلغي بطاقة الولاء من صفحتها مباشرة.','A guest revokes a loyalty card directly from its page.'],
  ])],
 ['dpa',a('شروط معالجة البيانات للمشتركين','Data processing terms for subscribers'),
  list([
   ['نعالج بيانات عملائك لتقديم الخدمة فقط، وبتعليماتك، ولا نستخدمها لأغراضنا.','We process your guests’ data only to provide the service, on your instructions, and never for our own purposes.'],
   ['موظفونا ومزودونا ملتزمون بالسرية، والمزودون مذكورون في سياسة الخصوصية.','Our staff and providers are bound by confidentiality; providers are listed in the privacy notice.'],
   ['نساعدك في طلبات أصحاب البيانات، ونبلّغك دون تأخير عند أي تسريب يخص بياناتك.','We help you answer data subject requests and tell you without delay about any breach affecting your data.'],
   ['عند انتهاء الاشتراك أو طلب الحذف نحذف البيانات وفق قسم «حذف الحساب».','When the subscription ends or deletion is requested, we erase the data as described under “Deleting your account”.'],
  ])],
];
const focus=new URLSearchParams(location.search).get('section')||({'/privacy':'privacy','/terms':'terms'})[location.pathname.replace(/\/$/,'')];
document.querySelector('#main').innerHTML=`<article class="card legal-doc"><span class="pill">${a('آخر تحديث','Last updated')} ${VERSION}</span><h1>${a('السياسات والشروط','Policies and terms')}</h1><nav aria-label="${a('الأقسام','Sections')}"><ul>${sections.map(([id,title])=>`<li><a href="#${id}">${e(title)}</a></li>`).join('')}</ul></nav>${sections.map(([id,title,html])=>`<section id="${id}"><h2>${e(title)}</h2>${html}</section>`).join('')}<p><a href="/">${a('العودة للرئيسية','Back to home')}</a></p></article>`;
if(focus&&!location.hash)document.getElementById(focus)?.scrollIntoView();
const pending=a('قيد الإصدار','Being issued');
fetch('/api/legal').then(r=>r.json()).then(({legal:l})=>{
 const support=[l.support_email||'hello@zimara.co',l.support_phone].filter(Boolean);
 const rows=[[a('الاسم القانوني','Legal name'),a(l.legal_name_ar,l.legal_name_en)||l.legal_name_ar||l.legal_name_en||pending],[a('السجل التجاري','CR number'),l.cr_number||pending],[a('الرقم الضريبي','VAT number'),l.vat_number||a('غير مسجلة في ضريبة القيمة المضافة','Not VAT-registered')],[a('العنوان','Address'),a(l.address_ar,l.address_en)||l.address_ar||l.address_en||pending]];
 document.querySelector('#legal-id').innerHTML=`<dl>${rows.map(([k,v])=>`<dt>${e(k)}</dt><dd>${e(v)}</dd>`).join('')}<dt>${a('الدعم','Support')}</dt><dd>${support.map(s=>s.includes('@')?`<a href="mailto:${e(s)}">${e(s)}</a>`:e(s)).join(' · ')}</dd></dl>`;
}).catch(()=>{});
