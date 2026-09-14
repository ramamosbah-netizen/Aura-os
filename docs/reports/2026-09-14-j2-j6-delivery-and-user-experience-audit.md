# AURA Business Journey Audit — Award to Project Handover + End-user Experience

14 September 2026 · Asia/Dubai · Current working tree · **Audit coverage extended through handover; operational acceptance remains OPEN.**

## النتيجة والحدود

AURA يستطيع تنفيذ أجزاء مهمة من رحلة التسليم، لكن الموظف لا يستطيع الاعتماد على رحلة متصلة وواضحة من أول الطلب حتى الإقفال. المشكلة تجمع بين روابط تفقد المشروع، وظائف تظهر دون حفظ مخرجاتها، وفجوات في انتقال الكميات والبيانات إلى الفوترة والخدمة.

حسب طلب المستخدم الجديد، امتد **التدقيق** إلى J2–J6 قبل إغلاق إصلاحات J1، لفهم الرحلة كاملة. لم نبدأ redesign شاملًا أو إصلاح Procurement منفصلًا. تبقى [فجوات J1 الأربع عشرة](2026-09-13-j1-enquiry-to-approved-offer.md) مفتوحة. لا تعني هذه الجولة أن الشركة أو المشروع الحي سلّما أو استلما أي أعمال.

تمت مراجعة Backend + Domain + API + UI + permissions + handoffs. المتصفح استُخدم للقراءة والتنقل وفتح نماذج ثم إلغائها بحساب `u-admin`. الاختبار الجديد يستخدم مشروعًا واحدًا مرتبطًا بعرض معتمد وترسية وعقد، داخل API معزول في الذاكرة مع JWT ON وهويتين إداريتين افتراضيتين. يستكمل هذا الاختبار من الترسية؛ ليس استمرارًا لبيانات J1 الحية أو إثباتًا لكل دور وظيفي.

**ما وصلنا إليه في الاختبار المعزول:** Tender award → Contract active → Project with frozen commercial source → explicit delivery mapping → approved engineering drawing → installation + daily report approval → certification → AR invoice issue + local receipt → failed T&C test → punch correction → retest pass → commissioned → controlled certificates/as-built → O&M acceptance → client training/spares acknowledgements → handover submitted/accepted → dossier issue + draft transmittal → service contract → project closeout record completed.

**ما لا تثبته هذه السلسلة:** لم تمر مشتريات هذا المشروع بمراحل PR/RFQ/PO/GRN/stock؛ اختُبرت هذه بصورة مستقلة وكُشفت عيوبها. ليست المستندات الافتراضية دراسة هندسية حقيقية، ولا التوقيعات أسماء شهود فعليين، ولا receipt تحويلًا بنكيًا. لا يوجد اختبار مشروع MEP كامل أو جميع أنظمة ELV، ولا تجربة موظفين فعلية أو إثبات PostgreSQL جديد. حفظ closeout completed لا يساوي تلقائيًا project completed؛ الإجراء الأخير منفصل في المنتج.

## قواعد قراءة الأدلة

- **B:** فحص مباشر للواجهة على مشروع موجود `c7846361-b9d7-42ec-890f-7d76799cb1a9`، وهو مشروع اختبار سابق، وليس عقد العميل الحقيقي في Tender المستخدم.
- **A:** HTTP جديد، JWT ON، مشروع واحد افتراضي، وحفظ بيانات معزول.
- **H:** HTTP موجود أعيد تشغيله. معظم ملفات workflow تعمل بسياق اختبار لا يثبت أدوار الموظفين؛ ملف scope منفصل يختبر الصلاحيات.
- **S:** قراءة التنفيذ الحالي بمصدر محدد. ليست مشاهدة لحفظ حي أو قياس أداء فعلي.
- **PENDING:** لم يثبت؛ لا يعني أن الوظيفة غير موجودة.

## J2 — Award → Mobilisation → Engineering Release

| السؤال | ما وجده التدقيق | ما يحتاجه المستخدم / الحكم |
| --- | --- | --- |
| 1. هل يعرف ماذا يفعل؟ | Project 360 يعرض next action لبناء WBS، وسبب منع Start execution. My Projects يعرض 1860 إجماليًا لكن البحث والصفحات يتعاملان مع 50 سجلًا فقط. B/S | حافظ على next action؛ أوصل البحث لكل المشاريع المسموحة. لا تعرض للمستخدم تقريرًا تقنيًا بدل مهمة واضحة. |
| 2. هل الوظائف مكتملة؟ | الترسية تنشئ العقد، وتفعيله ينشئ مشروعًا وfrozen handover؛ WBS/CBS وbaseline متاحة. إنشاء delivery mapping موجود في API، لكن لوحة mapping للقراءة فقط وBFF المعروض GET فقط. A/S | خطوة «راجع نطاق العقد ووزّعه على حزم التنفيذ» قابلة للعمل من الشاشة، ثم اعتماد الخطة والتكليف. |
| 3. هل البيانات كافية؟ | الاختبار حفظ كمية مباعة 10 في frozen source وربطها ببند تنفيذ. بعد public mapping بقي Sold في quantity position = null؛ لا يستدعي المسار postSold. A/S | لا إعادة كتابة الكمية المباعة. اجعل مصدر العقد المعروف يصل إلى projection بعلاقة canonical قابلة لإعادة التشغيل دون تكرار. |
| 4. كيف يستلم التالي؟ | Team وActivities/My Work موجودة؛ اكتمال حزمة تسليم فني إلى مسؤول مسمّى مع due date وقبول استلام لم يُثبت. PENDING | PM/Engineer يستلم العقد والنطاق والمراجع والالتزامات والمراجعة المعتمدة كتكليف واضح، لا يبحث عنها بين modules. |
| 5. هل توجد حقيقة واحدة؟ | provenance من tender إلى contract إلى project محفوظة. الرسم المعتمد وDocControl يظلان مصدرين محددين لوظائف مختلفة. A/H | حافظ على ملكية كل سجل، ووصل المراجع في حزمة التسليم؛ لا تستبدلها بنسخ يدوية. |

## J3 — Engineering → Procurement → Material Delivery

| السؤال | ما وجده التدقيق | ما يحتاجه المستخدم / الحكم |
| --- | --- | --- |
| 1. هل يعرف ماذا يفعل؟ | مساحة المشروع تفتح PR مع المشروع محددًا. النموذج واضح كعنوان/مرجع/قيمة، لكنه لا يصف طلب مواد هندسيًا كاملًا. B | «اطلب مواد لحزمة العمل» ثم البنود والكميات وموعد الحاجة والمواصفة، لا عنوان وقيمة فقط. |
| 2. هل الوظائف مكتملة؟ | drawing reject/revise/approve/transmit تعمل في H. PR approval ينشئ PO؛ طريقة PO status تتجاوز صلاحية الاعتماد؛ supplier update غير متحقق؛ partial GRN يغير PO إلى received. H/A سابق أعيد | يجب إغلاق العيوب المعروفة في مسار J3؛ نجاح CRUD ليس نجاح شراء وتسليم. |
| 3. هل البيانات كافية؟ | PR لا يلتقط quantity/unit/material/specification/required-on-site/CBS في النموذج المفحوص. تسمية القيمة `$` رغم سياق AED. B/S | قائمة مواد مربوطة بالمصدر الهندسي وcost code وrequired date، مع عملة واضحة وموعد المورد. |
| 4. كيف يستلم التالي؟ | أحداث PO/GRN والتكلفة والكميات موجودة؛ issue 20 ثم return 5 لا يصل net issued إلى 15 في regression. H | المخزن والموقع يحتاجان ordered/received/outstanding/issued/returned موثوقة قبل الاعتماد على جاهزية المواد. |
| 5. هل توجد حقيقة واحدة؟ | هوية الحدث الفردي تختلط بهوية stock item في dedupe. التكلفة والكميات لهما سجلات مستقلة صحيحة في المقصد. S/H | أصلح هوية الحركة، ولا تغيّر معاني الكمية أو تعتبر وصول أي GRN اكتمال جميع البنود. |

## J4 — Site → Quality / HSE → Progress

| السؤال | ما وجده التدقيق | ما يحتاجه المستخدم / الحكم |
| --- | --- | --- |
| 1. هل يعرف ماذا يفعل؟ | Daily report يحفظ سياق المشروع عند الفتح. IR يقرأ قائمة المشروع لكن نموذج الإنشاء يعود إلى Select a project. HSE permit register يتجاهل projectId ويعرض سجلات عامة. B/S | الموقع المحدد ثابت خلال الرحلة، و«سجّل عمل اليوم / اطلب فحصًا / افتح تصريحًا» إجراءات مباشرة. |
| 2. هل الوظائف مكتملة؟ | submit/review/reject/resubmit/approve والimmutability للتقرير تعمل في H. IR → NCR → correction → rejected verification → corrected/closed تعمل. H | اكشف مسار فتح التقرير ومراجعته من register؛ النموذج الحالي يعطي submit/print ولا يوصّل إلى Report 360. |
| 3. هل البيانات كافية؟ | الصور والتوقيع ظاهران في Daily report وIR، لكنهما React state فقط ولا يدخُلان payload أو evidence write. التاريخ الافتراضي للتقرير من UTC؛ ظهر 13 سبتمبر أثناء 14 سبتمبر في دبي. B/S | حفظ الأدلة وربطها بالسجل، وإعادة فتحها بعد reload؛ تاريخ العمل وفق منطقة الشركة الزمنية. |
| 4. كيف يستلم التالي؟ | site installation أصبح installed=10، والمستخلص certified=10 على نفس المشروع. A. جودة وأمان المسار الأوسع مدعومان باختبارات مستقلة. H | لا تساوِ daily diary أو manpower بالكمية المركبة المعتمدة. مطلوب handoff واضح من installed إلى inspection ثم certification وفق القواعد القائمة. |
| 5. هل توجد حقيقة واحدة؟ | روابط source IR/NCR وrevision evidence موجودة؛ واجهة التقرير لا تحفظ أدلة المستخدم كما توحي. H/S | مصدر دليل واحد تحت السجل، يفتحه المهندس والمعتمد، مع رفض/تصحيح محفوظين. |

## J5 — Certification → Finance / Collection

| السؤال | ما وجده التدقيق | ما يحتاجه المستخدم / الحكم |
| --- | --- | --- |
| 1. هل يعرف ماذا يفعل؟ | شاشة IPC تشرح incremental valuation، لكنها تفتح قائمة عقود عامة رغم projectId. رابط Variation وصل فعليًا إلى controls الخاص بالمشروع بواسطة redirect؛ ليس 404. B | ادخل بعقد المشروع الحالي وأظهر الكميات والأعمال المتاحة للمطالبة، لا أعد اختيار العقد من كل العقود. |
| 2. هل الوظائف مكتملة؟ | certified IPC → draft AR → issue → receipt → paid نجحت في A؛ صلاحية billing cap اختُبرت في H. واجهة IPC لا توفر authoring لبنود frozen quantities. S | أوصل إعداد سطور المستخلص بالشاشة. إثبات paid المحلي لا يكفي لإقفال التحصيل البنكي أو المصالحة. |
| 3. هل البيانات كافية؟ | AR auto-draft يحتوي بندًا واحدًا quantity=1 بلا projectId/frozen lineage رغم IPC item-level. بعد إصدار الفاتورة والتحصيل بقي Billed=null. A/S | احمل مراجع بنود المستخلص/التنفيذ إلى الفاتورة دون تخمين كمية من القيمة الإجمالية. |
| 4. كيف يستلم التالي؟ | AR draft ينشأ تلقائيًا؛ contractRef محفوظ. لا يوجد في هذه الجولة دليل تسوية بنكية أو تحقق من withholding/retention/final account الفعلي. A/PENDING | finance يستلم المستخلص ومراجع اعتماده، ويعرف issued مقابل collected وما بقي، مع المسؤول والإجراء التالي. |
| 5. هل توجد حقيقة واحدة؟ | certified منفصل عن billed وعن paid، وهو فصل يجب الحفاظ عليه. الفجوة في الربط، لا في وجوب توحيد المقاييس. A/S | لا تجعل certified يعني billed أو receipt يعني اكتمال كمية؛ أكمل العلاقات القائمة. |

## J6 — Testing & Commissioning → Handover → Warranty / Service

| السؤال | ما وجده التدقيق | ما يحتاجه المستخدم / الحكم |
| --- | --- | --- |
| 1. هل يعرف ماذا يفعل؟ | فحص الشاشات مكمّل أدناه. توجد مساحات T&C وhandover/readiness/dossier، وnext actions للمصادر الناقصة. B/S | المستخدم يرى ما يمنع التسليم، من المسؤول، ورابط الإكمال. لا يرى مجرد checklist خضراء منفصلة عن الأدلة. |
| 2. هل الوظائف مكتملة؟ | fail يمنع commission؛ correction/retest يتيحانه. checklist tick مرفوض، وغياب O&M/training/spares يمنع submit. canonical evidence مكّن submit/accept. A | نحافظ على هذه القواعد. الاختبار القديم الذي يتوقع قبول checklist booleans قديم؛ لا نخفف القواعد لإرضائه. |
| 3. هل البيانات كافية؟ | dossier issue واحد؛ transmittal draft بلا recipient/sent/ack. عقد خدمة مولد بلا projectId؛ clientName مأخوذ من projectName بدل حساب العميل. A/S | اربط service contract بالعميل والمشروع والتسليم. اشرح فرق قبول الحزمة عن إثبات إرسال مستنداتها؛ لا تغيّر سياسة DocControl دون قرار business. |
| 4. كيف يستلم التالي؟ | handover accepted ينشئ AMC آليًا. closeout لا يصبح ready قبل checklist؛ بعد acknowledgements يصبح closeout completed وDLP له تاريخ، بينما project status منفصل. A | قدّم خطوات متتابعة ومتميزة: قبول الحزمة، إكمال التزامات الإقفال، إكمال المشروع، استلام الخدمة؛ لا تدمج القرارات. |
| 5. هل توجد حقيقة واحدة؟ | T&C/DocControl/Quality/O&M/training/spares تبني readiness من ملاكها. Closeout UI يقارن `finalized` بينما الخدمة تحفظ `completed`. S/A | وحّد تمثيل الحالة الصحيحة فقط؛ لا تعِد فتح semantics T&C أو تجعل قبول handover يثبت تلقائيًا final account أو retention release. |

## سجل فجوات الرحلة — 20 مدخلًا

كل الصفوف **OPEN**. يتضمن السجل نتائج سابقة أعيد إثباتها، وليس 20 عيبًا جديدًا. UX-01 يجمع عائلة أخطاء السياق؛ لا تُجمع حالاتها كعيوب منفصلة مرة أخرى. تصنيف BLOCKER هنا يقصد مسار المستخدم المحدد، لا أن التطبيق بأكمله لا يعمل.

| ID | التصنيف | النتيجة وأثرها | المصدر / الإثبات | الأولوية |
| --- | --- | --- | --- | --- |
| J2-01 | WRONG BEHAVIOR | My Projects يبحث ويصفّح أول 50 فقط، مع total=1860؛ يضلل البحث ونص «You have access to 50». | B01؛ `my-projects-client.tsx` local matches/usePaged؛ BFF يدعم q/offset بالفعل | عالية |
| J2-02 | BLOCKER | frozen delivery mapping واجهة read-only بلا إجراء إنشاء، رغم أن API يوفّر write محكومًا. | B02؛ `project-360-client.tsx` DeliveryPanel؛ `app/api/projects/delivery-item-maps/route.ts` | عالية |
| J2-03 | DISCONNECTED | frozen soldQuantity=10 وmapping موجودان؛ Sold projection يبقى null في public journey. لا يوجد subscriber لـdelivery_item_map.created يستدعي postSold. | A؛ `delivery-item-map.service.ts`، `quantity-ledger.service.ts` | عالية |
| J3-01 | WRONG BEHAVIOR | PO update-only actor يستطيع status=approved بينما approve route يرفضه. | Auth probe المعاد؛ depth audit finding 1 | حرجة |
| J3-02 | WRONG BEHAVIOR | issue/return لنفس stock item يتصادمان في dedupe؛ net issued 15 لا يتحقق. | quantity-ledger HTTP المعاد؛ depth audit finding 2 | حرجة |
| J3-03 | WRONG BEHAVIOR | استلام 1 من 100 يحوّل PO إلى received، دون تعبير دقيق عن المتبقي. | Auth probe المعاد؛ depth audit finding 3 | عالية |
| J3-04 | WRONG BEHAVIOR | تعديل المورد إلى missing-supplier يُحفظ. | Auth probe المعاد؛ depth audit finding 4 | عالية |
| J3-05 | INCOMPLETE | طلب المواد في الشاشة عنوان/قيمة/مشروع دون material lines/quantity/unit/spec/date/CBS، مع تسمية العملة `$`. | B04؛ `pr-list.tsx`؛ depth audit finding 5 | عالية |
| J4-01 | WRONG BEHAVIOR | Daily report وIR يعرضان photos/signature دون حفظهما مع السجل. | B05/B06؛ `daily-report-client.tsx`، `inspection-request-client.tsx`، `ui/file-attachment-zone.tsx` | عالية |
| J4-02 | WRONG BEHAVIOR | تاريخ اليوم الافتراضي UTC يسبق تاريخ دبي بعد منتصف الليل. | B05؛ `daily-report-client.tsx` today | متوسطة |
| J4-03 | CONFUSING | إنشاء IR يعيد اختيار المشروع رغم الدخول من مشروع محدد؛ list scoped لكن form غير مهيأ بالسياق. | B06؛ InspectionRequestsPage لا يمرر projectId للمكوّن | عالية |
| J4-04 | DISCONNECTED | Site diary register يتيح Submit/Print ولا يفتح Report 360 للمراجعة والتصحيح؛ مسار site/execution العام موجود لكنه يتجاهل projectId. | B05/S؛ `daily-report-client.tsx`، `app/site/execution/page.tsx` | عالية |
| J5-01 | DISCONNECTED | certified lines تتحول إلى AR lump sum دون frozen lineage؛ issued/paid لا ينتجان Billed quantity معلومة. | A؛ `cross-module-subscriber.ts` IPC→AR وAR issued→Billed | عالية |
| J5-02 | INCOMPLETE | شاشة IPC تعالج قيمًا إجمالية دون سطور الكميات الموجودة في API؛ مشروع الدخول لا يحدد العقد. | B08/S؛ `payment-certificates-client.tsx`، certificates page | عالية |
| J6-01 | DISCONNECTED | AMC مولد بلا project/handover canonical fields، واسم العميل يصبح اسم المشروع. | A/S؛ `handover-amc-subscriber.ts` | عالية |
| J6-02 | WRONG BEHAVIOR | واجهة closeout تختبر finalized، بينما الحالة المحفوظة completed؛ شروط إقفال أزرار التعديل/الإعادة لا تطابق الحالة النهائية. | A/S؛ Project360 CloseoutPanel، closeout domain | متوسطة |
| UX-01 | DISCONNECTED | Engineering وT&C وHandover تتوقع project لا projectId؛ HSE permits وSite execution وIPC لا تستخدم projectId المرسل. context badge قبل الخروج لا يثبت استمراره بعده. | B03/B07/B08/B09/B10، source destinations | عالية |
| UX-02 | CONFUSING | شاشات متعددة تشرح canonical authority/connected sources وSnapshot hash بدل المسؤول والمطلوب؛ تبويبات مختلفة باسم Project 360 نفسه. dossier يعرض ISSUED TO THE CLIENT فوق opened, not yet sent، ما يحتاج تسمية أوضح دون تغيير سياسة الإرسال. | B02–B10، screenshot Project 360 | متوسطة |
| UX-03 | CONFUSING | planned internal project يوصف Awarded؛ closeout incompleteness يعرض مبكرًا بجوار متطلبات بدء التنفيذ. يجب تمييز المطلوب الآن عن المطلوب لاحقًا. | B02/S؛ situationText مبني على status وحده | متوسطة |
| UX-04 | INCOMPLETE | lens المشروع يوفّر ثمانية أنظمة ELV، بينما IR vocabulary يدعم Mechanical/HVAC/Plumbing/Fire Fighting؛ تجربة MEP غير متناسقة. | B02/B06؛ `project-scope.ts` مقابل shared disciplines | عالية |

## سجل المشاهدة في المتصفح

| Ref | النقرات / الشاشة | الدليل والحدود |
| --- | --- | --- |
| B01 | My Projects → search Marina → clear → project | total 1860 مقابل pagination 50؛ البحث 0 of 50. لا ندعي أن Marina موجود خارج النتائج؛ نثبت أن البحث لم يسأل بقية المجموعة. |
| B02 | Project 360 → Build the WBS / Scope & plan | سبب منع التنفيذ ظاهر، وWBS/CBS forms متاحة؛ mapping read-only. origin internal مع عنوان situation Awarded. لقطة desktop تؤكد كثافة النص وتعدد navigation. |
| B03 | Engineering workspace → Technical queries | اسم المشروع ظاهر في مساحة التجميع؛ الوجهة `/engineering?projectId=…` تعرض All projects و95 drawing decisions. مصدر الصفحة يقرأ `project`. هذه ليست صلاحية وصول غير مشروعة لأن الحساب admin. |
| B04 | Procurement workspace → Material requirement → New Purchase Request → Cancel | المشروع مختار تلقائيًا؛ النموذج header فقط؛ Estimated cost ($). لا إنشاء ولا اعتماد حي. |
| B05 | Site workspace → Daily reports | project محدد؛ photos/signature ظاهران؛ تاريخ default 13 سبتمبر وقت تاريخ دبي 14. فحص save يثبت غياب الأدلة عن payload. لم أرفع أو أوقّع ملفًا حيًا. |
| B06 | Quality workspace → Inspection | نموذج المشروع Select a project رغم query scoped؛ disciplines كاملة نسبيًا؛ photos/signature ظاهران وغير موصولين بالحفظ. |
| B07 | HSE workspace → Permit register | مساحة المشروع بلا records؛ الوجهة تعرض register عامًا وتحذير 39 تصريحًا متجاوزًا للوقت دون scope المشروع. source يؤكد تجاهل query. |
| B08 | Commercial workspace → Variation، ثم Certifications | Variation redirected بنجاح إلى project controls؛ IPC يفتح عقودًا عامة ونموذج valuation إجمالي. لا نسجل broken link لمجرد شكل href الأولي. |
| B09 | Testing workspace → commissioning، ثم اختيار المشروع من القائمة | الرابط الأول يفتح All projects/500 systems. إعادة الاختيار تضيف `project=` وتعرض system واحدًا commissioned وready دون blockers. يؤكد أن الوجهة قادرة على العمل عند تمرير السياق الصحيح. |
| B10 | Handover workspace → Acceptance & certificates → اختيار المشروع → Handover dossier → توسيع HO-J331456 | الرابط الأول يعرض All projects. بعد اختيار المشروع ثم dossier ظهرت حزمة واحدة accepted و12 عنصرًا ready؛ as-built وT&C certificate وتسعة O&M وتدريب acknowledged. Issue 1 محفوظ، وTR-HO-J331456-1 يصرح opened, not yet sent by document control رغم عنوان ISSUED TO THE CLIENT. هذا إثبات عرض بيانات fixture فقط، وليس إرسالًا أو قبولًا جديدًا من عميل حقيقي. |

لم نقس مدة إنجاز مستخدم حقيقي أو قابلية الاستخدام على الهاتف أو الامتثال الكامل لـWCAG. لذلك هذه **مراجعة UX عملية بأدلة** وليست شهادة usability شاملة.

## تجربة المستخدم المطلوبة — معايير قبول قابلة للاختبار

| المستخدم | ماذا يرى أولًا؟ | الإجراء الأساسي | ما يجب أن ينتقل للفريق التالي؟ |
| --- | --- | --- | --- |
| Sales | طلب العميل، المرحلة، النواقص، المالك والموعد | سجّل enquiry / سلّم للدراسة | نفس المتطلبات والموقع والمستندات، مع تكليف Engineer |
| Pre-Sales | «دراساتي المطلوبة» والسياق والمراجع | أكمل الدراسة / اطلب clarification | نطاق معتمد ومراجعة محددة وكميات قابلة للتقدير |
| PM | المشروع والعقد والنطاق المعتمد وما يمنع البدء | استلم الحزمة / وزّع حزم التنفيذ / اعتمد الخطة | مسؤولون ومواعيد ومراجع معتمدة، دون نسخ الكميات |
| Engineer | الحزم المكلف بها وآخر drawing/spec revision | أرسل للمراجعة / ردّ على RFI / أطلق للتنفيذ | الإصدار المعتمد ومتطلبات المواد والاختبار |
| Buyer / Storekeeper | طلبات المواد المطلوبة ومواعيدها والمتبقي | اطلب عروضًا / اعتمد شراءً / سجّل وصولًا جزئيًا | بنود المورد والكميات ومراجع الاستلام والحركات |
| Site Engineer | أعمال اليوم بالموقع والحزم والتصاريح والمواد | سجّل تركيبًا وأدلة / اطلب فحصًا | كمية فعلية ومكان ودليل محفوظ ومسؤول فحص |
| QA/QC / HSE | فحوصات وتصاريح مستحقة ضمن المشروع | افحص / ارفض مع سبب / تحقق من الإصلاح | قرار موثّق مرتبط بالعمل، دون دمج سلامة العامل وتدريب العميل |
| QS / Finance | أعمال متاحة للمطالبة ومطالبات معتمدة | أعد مستخلصًا / أصدر فاتورة / طابق التحصيل | بنود ذات provenance ومبالغ وقيود ومراجع تسوية |
| T&C Engineer | الأنظمة غير الجاهزة وأسباب المنع | عالج المتطلبات / سجّل اختبارًا / أعد الاختبار | شهادة واختبارات وعيوب مغلقة محفوظة |
| Handover / FM | ما بقي لكل نظام ومن المسؤول عنه | أكمل الحزمة / سجل قبول العميل / سلّم للخدمة | dossier revision، as-built، O&M، تدريب، spares، warranty وasset/project/client links |

معايير الشاشة: اسم المشروع/العميل ثابت؛ next action واحد بارز؛ المسؤول وdue date ظاهرين؛ label واضح لكل input؛ منع الإجراء يشرح السبب ويربط بالإصلاح؛ الصور والتوقيعات لا تظهر Saved قبل حفظها وربطها؛ كل register يفتح السجل؛ كل tab يذكر الوظيفة والسجل؛ اختصارات WBS/CBS/CPI/SPI لها شرح قصير؛ الخطأ يختلف عن «لا سجلات»؛ بحث وصفحات على كامل المجموعة المسموحة؛ بحث المشروع لا يتحول إلى قرار أمني في React.

استعمال AURA launcher مناسب لفتح مساحة عمل متخصصة. Dashboard يحتفظ بالموقف والإجراء التالي وروابط السياق؛ workspace يحتوي العمل الفعلي. لا يحتاج كل إجراء ثلاث صفحات تمهيدية متطابقة، ولا يلزم تغيير ملاك البيانات لتحقيق ذلك.

## نتيجة الاختبارات وحدودها

| التشغيل | النتيجة الجديدة | المعنى |
| --- | --- | --- |
| 12 ملف HTTP للرحلات القائمة | 10 ملفات نجحت، 2 فشلت؛ 33 اختبارًا نجح، 2 فشلا | الفشلان: quantity movement defect، وcommissioning fixture قديم يتوقع tick يدويًا. |
| delivery audit الجديد مع JWT ON | ملف واحد / اختبار واحد ناجح | نفس المشروع وصل إلى قبول حزمة التسليم وإكمال closeout record؛ توجد observations لعيوب بقيت مفتوحة. |
| service-scope closure مع JWT ON | ملف واحد / 69 اختبارًا نجحت | إعادة تحقق من نطاق المشروع والوظيفة المطلوبة وحالات الرفض؛ ليست إثبات UI بأدوار الموظفين. |

مجموع الاختبارات المميزة في التشغيلات النهائية: **103 ناجحة + 2 فاشلة = 105** عبر 14 ملفًا. لا نقول إن regression أخضر. تشغيل scope الأول افتقد JWT prerequisite فتوقفت تهيئته؛ أُعيد بالمفتاح الافتراضي في عملية الاختبار وحدها ونجح 69/69، دون تعديل إعدادات التطبيق الحي.

لم يُعد build/typecheck شاملان لأن المنتج لم يتغير؛ ملفات هذه الجولة اختبار وتقرير فقط. لا نستخدم نتائج قديمة كشهادة حالية. PostgreSQL وoutbox recovery والبنك والبريد والتوقيع الخارجي وrole-by-role browser writes تبقى PENDING.

الملفات القابلة للتدقيق:

- [اختبار رحلة التسليم](../../apps/api/test/j2-j6-delivery-audit.e2e-spec.ts)
- [سجل النتائج JSON](2026-09-14-j2-j6-auth-observations.json)
- [نطاق الصلاحيات](../../apps/api/test/service-scope-closure.e2e-spec.ts)
- [سجل الكميات](../../apps/api/test/quantity-ledger.e2e-spec.ts)
- [الاختبار القديم للتسليم](../../apps/api/test/commissioning-handover-workflow.e2e-spec.ts)
- [النتائج السابقة بأدلتها](2026-09-13-business-capability-depth-audit.md)

السجلات التنفيذية: `.aura-j2-j6-regression.log`، `.aura-j2-j6-auth.log`، `.aura-j2-j6-scope.log`.

### مراجع التنفيذ للنتائج الجديدة

| الموضوع | المصدر |
| --- | --- |
| بحث المشاريع المحلي | [MyProjectsClient](../../apps/web/components/my-projects-client.tsx#L74)، [BFF query forwarding](../../apps/web/app/api/projects/mine/route.ts) |
| تخطيط التنفيذ وmapping | [DeliveryPanel](../../apps/web/components/project-360-client.tsx#L830)، [mapping service](../../modules/projects/src/delivery-item-map.service.ts)، [quantity ledger](../../modules/projects/src/quantity-ledger.service.ts)، [BFF read only](../../apps/web/app/api/projects/delivery-item-maps/route.ts) |
| تكوين روابط المساحات | [Project section workspace](../../apps/web/app/project/[projectId]/workspace/[section]/page.tsx)، [Engineering query](../../apps/web/app/engineering/page.tsx#L117)، [T&C query](../../apps/web/app/commissioning/page.tsx#L22)، [Handover query](../../apps/web/app/handover/page.tsx#L41) |
| أدلة وتاريخ الموقع | [Report save](../../apps/web/components/daily-report-client.tsx#L38)، [IR save](../../apps/web/components/inspection-request-client.tsx#L29)، [local file state](../../apps/web/components/ui/file-attachment-zone.tsx)، [execution register](../../apps/web/app/site/execution/page.tsx) |
| الشراء والسلامة | [Purchase request UI](../../apps/web/components/pr-list.tsx)، [permit register](../../apps/web/app/hse/permits/page.tsx#L62) |
| المستخلص والفاتورة | [IPC UI](../../apps/web/components/payment-certificates-client.tsx)، [certificates page](../../apps/web/app/contracts/certificates/page.tsx)، [cross-module subscribers](../../apps/api/src/events/cross-module-subscriber.ts#L940)، [invoice service](../../modules/finance/src/customer-invoice.service.ts) |
| قبول التسليم وإقفال المشروع والخدمة | [HandoverService](../../modules/commissioning/src/handover.service.ts)، [closeout UI](../../apps/web/components/project-360-client.tsx#L1507)، [closeout domain](../../modules/projects/src/domain/closeout.ts)، [AMC handoff](../../apps/api/src/events/handover-amc-subscriber.ts) |

## ترتيب العمل بعد فهم الرحلة

1. **J1 Intake → Study handoff:** أزل blocker دور Sales، وأكمل المتطلبات والتكليف والمراجع ثم canonical scope/estimate/approval/output/revision؛ بدون بدء Procurement أولًا.
2. **J2 Mobilisation:** بحث صحيح، intake للحزمة المعتمدة، UI mapping، نشر Sold، الفريق والخطة؛ إصلاح السياق المشترك ضروري قبل تجربة بقية الأدوار.
3. **J3 Materials:** معالجة عيوب الاعتماد والحركات والاستلام والمورد، ثم ربط طلب المواد الهندسي بالشراء والتسليم.
4. **J4 Field evidence:** حفظ الصور والتوقيعات، تاريخ العمل الصحيح، فتح التقرير ومراجعته، طلب الفحص في نفس المشروع.
5. **J5 Commercial handoff:** سطور المستخلص في UI، frozen lineage إلى AR، ثم إثبات issued/billed/collected والمصالحة كلٌ بمعناه.
6. **J6 Closeout/service:** إظهار الحالة النهائية الصحيحة، تكليف استكمال كل blocker، canonical client/project/handover إلى الخدمة؛ الحفاظ على readiness وDocControl والكمية الحالية.

تتحسن الواجهة مع كل حزمة عمل، ثم يُثبت نفس job بموظفي Sales/Engineer/PM/Buyer/Store/Site/QA/HSE/QS/Finance/T&C/Handover. لا يكفي تغيير الألوان أو نجاح fixtures إدارية لإغلاق أي رحلة.

**تم توسيع التدقيق حتى handover، لكن AURA business journeys ليست CLOSED / VERIFIED ولا Production Ready.**
