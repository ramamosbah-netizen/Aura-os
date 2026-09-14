# AURA Business Journey Audit — J1: Enquiry to Approved Offer

13 September 2026 · Updated 14 September 2026 (Asia/Dubai) · **Audit pass recorded; J1 is OPEN / NOT VERIFIED.**

**توسعة نطاق التدقيق بطلب المستخدم:** أُكملت جولة [J2–J6: Award to Handover + End-user Experience](2026-09-14-j2-j6-delivery-and-user-experience-audit.md) لفهم بقية الرحلة قبل الإصلاح. لا يعني الانتقال بالتدقيق إغلاق J1 أو تغيير أولوية إصلاح Intake → Technical handoff.

## القرار ونطاق العمل

أصبح ترتيب العمل Journey-first حسب توجيه المستخدم: نبدأ من Sales الذي استلم enquiry، ثم نتتبّع التسليم إلى Pre-Sales / Engineer، ثم Estimator وManagement، وصولًا إلى العرض والقرار. توقف الـredesign العام وإصلاح Procurement. تبقى النتائج السابقة محفوظة في سجل الفجوات أدناه حتى نصل إلى رحلتها أو تمنع J1 فعليًا.

هذه الجولة وجدت أساسًا تجاريًا يعمل، لكنها **لم تثبت رحلة موظفين كاملة دون انقطاع**. دور Sales الافتراضي تعطل عند تسجيل الطلب؛ لا يوجد تكليف دراسة متكامل ظاهر في المسار المفحوص؛ والتحويل من الدراسة إلى التقدير والعرض لديه فجوات في الصلاحيات واستمرارية النطاق. لم نغيّر وظائف المنتج لتجاوزها.

تمت متابعة مسارين: Direct وTender/RFQ، عبر المراحل العشر المطلوبة. المراجعة تشمل مصدر Backend/Domain/API/UI/Permissions وhandoffs، واختبارات HTTP جديدة، ومشاهدة محددة للمتصفح. استؤنفت جولة المتصفح في 14 سبتمبر بعد استعادة الجلسة، وامتد الاختبار المعزول إلى مراجعة العرض وإعادة اعتماده وقبوله. لذلك لا يساوي هذا التقرير إغلاق J1 أو قبول المستخدمين أو Production Ready.

## سيناريو التدقيق

**Direct:** عميل افتراضي يطلب 24 كاميرا IP مع تسجيل 30 يومًا، موقع معلوم وموعد عرض خلال عشرة أيام. المطلوب أن يعرف المهندس ماذا يدرس، ثم يرى المقدّر الكميات نفسها، ويعرف المدير نطاق ومبلغ الاعتماد، ويتلقى العميل عرضًا يمكن تتبّعه إلى الدراسة.

**Tender/RFQ:** استلام مناقصة MEP، قرار Bid، تكليف مهندس، مستندات ومتطلبات، دراسة وclarifications، takeoff، تكلفة وتسعير، عرض فني وتجاري، اعتماد داخلي ثم submission/revision/award أو loss. اختبار الخادم استخدم بند MEP افتراضيًا؛ تسمية البند MEP لا تثبت ملاءمة جميع الأنظمة الهندسية.

**قواعد الإثبات:**

- B = مشاهدة متصفح حالية، بحساب الجلسة الموجود `u-admin`؛ ليست إثبات صلاحيات Sales أو Engineer.
- A = اختبار HTTP جديد مع Auth ON وهوية وصلاحيات معلومة.
- H = اختبار HTTP قائم أعيد تشغيله؛ غالبًا Auth OFF أو سياق اختبار محدد، فلا يُقدّم كإثبات صلاحيات شامل.
- S = مصدر حالي تم تتبّعه؛ يثبت وجود التنفيذ أو نقص العلاقة المحددة، لا نجاح الاستخدام الحي.
- PENDING = لم يثبت بعد؛ لا يُصنّف تلقائيًا MISSING.

تم تجهيز البيانات والهوّيات الجديدة داخل API معزول في الذاكرة. لم نرسل عرضًا لعميل، ولم نغيّر سجلات الشركة الحية. استخدام fixture administrator بعد عائق Sales موثّق، ولا يُحسب كنجاح لذلك الموظف.

## المشي في الواجهة: أين وصل المستخدم فعلًا؟

| الخطوة | الفعل والمشاهدة | النتيجة |
| --- | --- | --- |
| B01 | Sales & Commercial من القائمة → `/crm/overview` | نقطة الدخول تعرض Lead → Opportunity → Quotation → Contract، مع مساري Direct وTender. البداية المباشرة بطريق `/crm` كانت 404؛ هذا عنوان اختاره المدقق، وليس رابطًا معطّلًا مثبتًا في رحلة المستخدم. |
| B02 | Lead → `/crm/leads` → New Lead | نموذج: company، contact، phone، email، interest/requirement، source. يقول إن المالك يأتي لاحقًا من Lead 360. لا يلتقط الموقع والأنظمة والموعد والمستندات هنا. |
| B03 | فتح Lead 360 الموجود → Overview | يظهر missing qualification/contact channel/owner، مع next action للتأهيل. البيانات الأوسع تعرض في The job (ELV context). |
| B04 | Documents داخل Lead | عرض read-only وروابط إلى Document Control العام؛ يحتاج مسار رفع مرتبط بالسجل دون تعليم المستخدم إدخال نوع/ID الربط. لم أرفع ملفًا في الجلسة الحية. |
| B05 | الفرصة الموجودة `3a7301cf-13eb-43b9-b75b-4651e11da6e2` من سجل attention → Commercial | ظهرت Requirements/Scope Evidence ثم Scope Assist وOpen Pre-Award package. لم يظهر تكليف Engineer أو استقبال دراسة في هذا المسار. |
| B06 | Open quotation المرتبط بتلك الفرصة | العرض يشير إلى Opportunity، وله Overview/Pricing/Revisions/Terms/Negotiation/Approval/Documents. السجل المفحوص قديم من اختبار سابق ويعرض مبلغ opportunity كبند واحد، دون package؛ لا نعمّم هذا وحده على كل العروض. |
| B07 | Approval داخل العرض | ظهرت Technical proposal، Commercial offer، Vendor quotes، Datasheets كأدلة ناقصة، وإجراء Set a checklist. رابط attach evidence يعيد فتح العرض نفسه؛ يجب إثبات مسار الإرفاق كاملًا. |
| B08 | Negotiation | ظهرت رسالة تعذر الوصول إلى السجل. الانتقال التالي إلى Tender أعاد الصفحة إلى Sign in. لا ننسب المشكلة إلى خدمة التفاوض دون استبعاد انتهاء الجلسة. |
| B09 | محاولة استكمال Tender في المتصفح | PENDING بسبب انتهاء الجلسة. مشاهدات Tender السابقة في هذه المهمة تبقى أدلة سابقة، وليست إعادة تشغيل حالية للرحلة. |
| B10 | 14 سبتمبر: فتح Tender 360 نفسه بعد استعادة الجلسة | قرار BID=81.25 مقفل، وثلاثة ملفات (رسمان وscope summary). حالة التحميل الأولية ليست دليل فقد بيانات. لا يظهر تكليف دراسة فنية متكامل. |
| B11 | فتح نموذج clarification ثم إغلاقه دون حفظ | type/reference/subject/body/response due موجودة؛ لم يثبت ربط السؤال ببند requirement أو drawing revision. |
| B12 | Tender → BOQ workspace → Add line ثم Cancel | يحفظ tenderId؛ code/description/unit/quantity/rate وIFC GUID اختياري، دون مرجع requirement/drawing revision في النموذج. |
| B13 | Tender → Estimation & pricing | يحفظ tenderId؛ يمنع Generate quotation عندما تكون البنود فارغة. إرشاد إضافة البنود من tender detail قديم مقارنة بمساحة BOQ المنفصلة. |
| B14 | Tender Technical → Engineering العام | يوجد رابط صريح يعود إلى Tender 360؛ التصحيح: المشكلة رحلة ذهاب وعودة دون مساحة دراسة فنية، وليست غياب رابط الرجوع. |
| B15 | Quotation → Negotiation ثم Revisions | التفاوض يعمل بعد استعادة الجلسة ويعرض عدم وجود ملاحظات؛ السجل الحي المفحوص يعرض مراجعة واحدة. خلل السلسلة أدناه مثبت ببيانات اختبار مستقلة، وليس بهذا السجل الحي. |

الواجهات فُحصت على سجلات موجودة؛ لم تُنشأ سلسلة جديدة كاملة بالنقرات في هذه الجولة. النقرات السابقة تفسر قابلية الاكتشاف، والاختبارات المعزولة أدناه تفسر السلوك. الفصل بينهما مقصود.

## الأسئلة الخمسة في كل مرحلة

الأسئلة: Q1 هل يعرف ماذا يفعل؟ Q2 هل الوظائف متاحة؟ Q3 هل البيانات كافية وصحيحة؟ Q4 كيف يستلم التالي؟ Q5 هل توجد حقيقة واحدة؟

### 1 — Sales Intake

| السؤال | Direct | Tender/RFQ |
| --- | --- | --- |
| Q1 | New Lead واضح، لكن enquiry الغني يبدأ كنموذج مختصر؛ استكمال معلومات الدراسة ليس جزءًا ظاهرًا من نفس الخطوة. B02–B03 | إنشاء tender يقبل title/customer/deadline/source. ينبغي أن يوضح أين يضع الموظف حزمة RFQ وموقع العمل. S |
| Q2 | Create/Edit/qualification/assign/convert موجودة؛ دور `r-sales` يعيد 403 على create وqualify وconvert. A | Create/edit وstudy-files موجودة. تسليمها إلى مهندس لم يثبت كعملية مستقلة. S/H |
| Q3 | الموقع والأنظمة والسياق موجودة في DTO/domain، لكن نموذج الالتقاط لا يعرضها، وEdit المفحوص لا يعرض كل الحقول الموجودة. S/B | المستندات مصنفة؛ contact/site/systems/technical owner ليست حزمة intake موحّدة في Tender DTO. S |
| Q4 | assignment للـLead له مسار وaccept؛ لا يساوي تكليف دراسة فنية. S/H | يظهر السجل في register؛ لا يوجد إثبات وصول دراسة مخصصة إلى inbox مهندس. PENDING/S |
| Q5 | مطابقة Account/Contact والتحويل يحفظان leadId؛ هذه قدرة قائمة يجب الحفاظ عليها. A/S | accountId وsourceOpportunityId أساس صحيح؛ يجب إثبات الاحتفاظ بحزمة enquiry دون إعادة رفعها. S |

### 2 — Qualification / Bid decision

| السؤال | Direct | Tender/RFQ |
| --- | --- | --- |
| Q1 | Lead score استشاري، وقرار qualification يدوي؛ ثم BANT في Opportunity. توضيح الفرق يمنع اعتبارهما نفس التقييم. B/S | شرح المعايير وقفل القرار من العمل السابق موجودان؛ يلزم تأكيد رحلة صاحب القرار بصلاحياته. H/S |
| Q2 | Qualify/disqualify/convert موجودة؛ العائق الحالي في service permission لدور Sales. A | No-Go يمنع estimating، والقرار المسجل لا يعدّل بصمت. H |
| Q3 | التحويل لا يشترط اكتمال كل بيانات الدراسة؛ يجب فصل أهلية تجارية عن جاهزية فنية. S | تقييم تجاري لا يثبت جاهزية drawings/specs/takeoff. S |
| Q4 | التحويل يفتح فرصة ويحفظ المالك إن كان معيّنًا؛ لا ينشئ طلب دراسة تلقائيًا. A/S | الانتقال estimating لا ينشئ تسليمًا فنيًا مثبتًا. A/S |
| Q5 | qualification history والـlead lineage قائمان؛ لا ندمج تقييمات ذات أغراض مختلفة ميكانيكيًا. S | قرار Bid مستقل عن study sign-off واعتماد العرض؛ يجب ربطها لا خلطها. S |

### 3 — Technical Assignment

| السؤال | Direct | Tender/RFQ |
| --- | --- | --- |
| Q1 | لا يوجد إجراء ظاهر «Assign technical study» في المسار المفحوص. B/S | Technical launcher يفتح `/engineering` العام؛ لا يحمل tenderId. S |
| Q2 | Activity مخصصة للمهندس وصلت My Work في الاختبار. المهمة العامة موجودة؛ حزمة الدراسة غير مكتملة. A | نفس Activity يمكن ربطها بـTender في نموذج العلاقات؛ يلزم إثبات تسليم tender كامل بصلاحيات الموظفين. S |
| Q3 | التكليف يحتاج system/site/deadline/deliverables/input revisions/reviewer، لا subject/notes فقط. INCOMPLETE | نفس الاحتياج، مع addenda والمهلة الخاصة بالمناقصة. INCOMPLETE |
| Q4 | اختبار inbox: صفر قبل إنشاء المهمة؛ تظهر المهمة بعد الإسناد اليدوي. لا يوجد auto-handoff مُثبت. A | لا تُحسب رؤية Tender في register كاستلام Engineer للتكليف. PENDING |
| Q5 | إعادة استخدام Activity ومرجع opportunity/tender هي نقطة البداية؛ لا إنشاء inbox منفصل لكل module. A/S | المحافظة على tender identity عند فتح دراسة/clarification/estimation. S |

### 4 — Technical Study + Survey + Clarifications

| السؤال | Direct | Tender/RFQ |
| --- | --- | --- |
| Q1 | Requirements داخل Commercial؛ النص يقدّمها كمدخل Scope Assist أكثر من سجل دراسة للمهندس. B | study-files يسهّل حفظ الأدلة؛ لا يوضح دورة تنفيذ ومراجعة الدراسة كاملة. S |
| Q2 | Requirements وscope وأسئلة/assumptions موجودة جزئيًا؛ لا توجد في المسار حزمة survey/compliance/deviations/sign-off مترابطة. S | ملفات وclarifications/addenda موجودة. هذه ليست بديلًا عن requirement compliance matrix ومخرجات هندسية معتمدة. S/H |
| Q3 | Requirement له title/detail/priority/status؛ لا يملك حقول clause/system/reviewer/document revision منظمة. S | clarification له question/answer/dates؛ ربطه ببند requirement/quantity/deviation يحتاج إكمالًا. S |
| Q4 | Site survey الحالي موجّه لإنشاء فرصة من field intake، وليس تكليف survey داخل opportunity قائمة؛ ربطه يحتاج قرارًا واعيًا لتجنب فرصة ثانية. S | خروج Technical إلى Engineering delivery العام يقطع سياق pre-award. S |
| Q5 | بعد التحويل بقي requirement النصي على Lead، لكن قائمة requirements في Opportunity كانت فارغة. Scope Assist يجمع requirements/scopes فقط، لا Lead أو study files مباشرة. A/S | لا دليل أن رفع specification يتحول إلى متطلبات أو أن addendum يحدد الدراسة/الكميات المتأثرة. INCOMPLETE |

### 5 — Quantity Take-Off / Estimation

| السؤال | Direct | Tender/RFQ |
| --- | --- | --- |
| Q1 | Open Estimation يأتي بعد scope approval ويفتح workspace يحتفظ بمعرّف الفرصة. S | BOQ منفصل عن dashboard، ثم pricing على tender؛ مصدر الكميات من الدراسة غير كافٍ. S |
| Q2 | تكلفة مواد/عمالة/مهندس/PM/نقل/معدات/subcontract/loadings موجودة. لا نعيد بناء calculator. S/A | BOQ import وrate build-up وestimate sourcing موجودة؛ إثبات takeoff من drawing revision غير مكتمل. S/H |
| Q3 | approved quantity=24، لكن API قبل create estimate بخطوط caller quantity=240 وحسب cost=24000. A | وجود priced estimate واحد يكفي بعض البوابات؛ لا يثبت أن جميع بنود scope/BOQ مغطاة. S |
| Q4 | الواجهة تنسخ basis lines إلى طلب التقدير؛ الخادم يجب أن يستمدها من basis المعتمد بدل الوثوق بهذه النسخة. A/S | handoff يحتاج checked takeoff وإشارات نقص الدراسة، لا مجرد الانتقال priced. S |
| Q5 | تحديث build-ups يعيد قراءة basis canonical، بينما إنشاء estimate لا يفعل الشيء نفسه؛ مساران بنتيجة مختلفة. S/A | supplier source يحمل reference/cost/staleness؛ الربط التفصيلي بالمراجعات يجب الحفاظ عليه. S |

### 6 — Pricing

| السؤال | Direct | Tender/RFQ |
| --- | --- | --- |
| Q1 | workspace يفصل cost عن margin/markup/discount؛ اتجاه مفهوم يجب الحفاظ عليه. S | صفحة pricing داخل tender موجودة؛ يلزم فصل جاهزية study عن مجرد إدخال rates. S |
| Q2 | Open → policy → freeze → revision موجودة؛ الاختبار استخدم هذه الإجراءات نفسها. A | rate build-up وsupplier sourcing موجودان. H/S |
| Q3 | المسار الصحيح: cost 2400، margin 20%، sell 3000، total 3150؛ الحساب متسق في الاختبار. A | submission value يحفظ snapshot؛ يجب أن يرتبط بالمراجعة المعتمدة للعرض لا فقط tender value. S/H |
| Q4 | frozen pricing تنتج quotation identity قابلة لإعادة الطلب دون نسخة إضافية. A | الانتقال إلى submission لا يطلب اعتماد offer داخلي في البوابة المفحوصة. A/S |
| Q5 | الحقيقة المالية موجودة، لكن quotation الناتجة تحمل بندًا واحدًا «Selling price — 20% target margin» بدل وصف 24 كاميرا. A | يجب توثيق هل تقدير مورد/BOQ revision/offer revision هي نفسها التي اعتُمدت. PENDING |

### 7 — Internal Approval

| السؤال | Direct | Tender/RFQ |
| --- | --- | --- |
| Q1 | Approval tab يعرض checklist ونواقص، لكن بعض النصوص تقول «approving without them» بينما الخادم يرفض ذلك؛ wording مربك. B/A | لا يظهر اعتماد offer مستقل في tender gate الحالي. S/A |
| Q2 | رفض self-approval=403؛ رفض قبل evidence=409؛ اعتماد بهوية ثانية بعد checklist نجح. A | scope author بلا approvepermission يُرفض على `/approve` لكنه يستطيع `approve:true` أثناء الإنشاء. هذه أيضًا فجوة داخل J1 Direct، وليست Procurement. A |
| Q3 | evidence checklist يثبت وجود المراجع؛ لا يثبت وحده جودة الدراسة أو تطابق ملفات العرض. A/S | submission نجح دون study أو internal offer approval في fixture. A |
| Q4 | يحتاج المُعتمد package واضحة تعرض study revision + scope + estimate + pricing + deviations؛ الأرقام وحدها غير كافية. INCOMPLETE | ربط approval ثم السماح بالsubmission مطلوب في رحلة المستخدم. INCOMPLETE |
| Q5 | immutable commercial baseline قاعدة جيدة؛ upstream scope/quantity mismatch يمنع الادعاء بأنها تمثل دراسة صحيحة دائمًا. A/S | Bid decision لا يُستخدم كبديل لاعتماد العرض النهائي. S |

### 8 — Customer Offer / Submission

| السؤال | Direct | Tender/RFQ |
| --- | --- | --- |
| Q1 | Export PDF وsend lifecycle موجودان. لم يُرسل عرض خارجي خلال التدقيق. B/S | Submit يسجل method/reference/time/value، لكنه لا يثبت وصول محتوى صحيح إلى العميل. H/S |
| Q2 | pricing materialisation وdocument output قائمان. يحتاج output فني وتجاري قابل للربط بالدراسة. A/S | submission/resubmission سجل append؛ قدرة موجودة لا نعيد إنشاءها. H |
| Q3 | fresh opportunity بلا package استطاعت إنشاء quotation=201؛ «legacy» يُحدد بغياب package، لا بكون الفرصة قديمة. A/S | العرض الفني/التجاري المعتمد ليس شرطًا مثبتًا في submit الحالي. A |
| Q4 | الخطوة للعميل تحتاج معرفة الملف والمراجعة والمستلم والقناة، مع عدم كشف هامش الربح الداخلي. S/INCOMPLETE | reference وchannel موجودان؛ ربط approved offer revision يحتاج إثباتًا/إكمالًا. S |
| Q5 | lump-sum مشروع ممكن، لكن وصف سياسة الهامش لا يشرح scope العميل، ومرجع study غير ظاهر في البند المولّد. A | snapshot للمبلغ موجود؛ lineage التفصيلي للمستندات/النطاق لم يثبت. H/PENDING |

### 9 — Revision / Negotiation

| السؤال | Direct | Tender/RFQ |
| --- | --- | --- |
| Q1 | تبويبا Negotiation وRevisions يعملان في القراءة الحية بعد استعادة الجلسة. B15 | clarification/addendum/resubmission موجودة؛ يلزم walkthrough لمراجعة حقيقية للعرض. S/H |
| Q2 | pricing revision → quote revision، ورفض التعديل على frozen وSoD قواعد موجودة. H/S | deadline extension والاعتراف بـaddenda موجودان. H/S |
| Q3 | negotiation amount لا يصبح مصدر السعر؛ السعر من revision chain. قاعدة صحيحة. S | addendaAcknowledged لا يثبت وحده تطبيق الأثر على الدراسة والكميات. S |
| Q4 | يجب أن يعود scope change للمهندس، وprice-only change للمقدّر/المعتمد المناسب؛ هذا التسليم لم يثبت كرحلة متكاملة. PENDING | نفس الحاجة لتحديد revisions المتأثرة ثم إعادة الاعتماد قبل resubmission. PENDING |
| Q5 | revision identity موجودة؛ لا نسمح بإعادة إدخال scope مستقل غير مرتبط بالتغيير. S | حفظ submission قديم جيد؛ ربطه بالtechnical/commercial revisions لا يزال مطلوبًا. S |

### 10 — Award / Loss ثم حدود J2

| السؤال | Direct | Tender/RFQ |
| --- | --- | --- |
| Q1 | accept/reject/loss actions موجودة؛ شرح الفرق بين win وaccepted offer يجب أن يقود المستخدم للفعل الصحيح. S/H | governed award بدل status=won، مع قيمة العميل وتاريخه، موجود. H |
| Q2 | quotation acceptance وcommercial baseline وcontract linkage موجودة. S/H | award evidence وdecline No-Go وloss history موجودة. H |
| Q3 | قيمة award لا تعيد كتابة estimate؛ هذا الفصل مهم ويظل قائمًا. S | tests تؤكد بقاء estimatevalue عند تسجيل awarded value مختلفة. H |
| Q4 | يبقى نفس job عبر contract/project؛ J2 تفحص mobilisation وengineering release لاحقًا. S/PENDING | لا ننتقل إلى J2 قبل إثبات J1 بالهوّيات الفعلية وربط حزمة العرض. PENDING |
| Q5 | روابط source opportunity/tender/quotation/contract موجودة؛ completeness للحزمة المستلمة بعد award لم تثبت هنا. S | لا نفتح مشروعًا بديلًا فقط لتحسين تجربة navigation. نطاق J2 مؤجل. |

## سجل فجوات J1

| ID | التصنيف | المشكلة المثبتة / حدود الإثبات | الدليل | الحالة |
| --- | --- | --- | --- | --- |
| J1-01 | BLOCKER | دور `r-sales` يعجز عن create/qualify/convert Lead بسبب service assertion لـ`crm.account.create` غير موجودة في الدور. | A، E01/E02 | OPEN؛ Admin continuation فقط للتدقيق |
| J1-02 | INCOMPLETE | Intake UI لا يلتقط جميع معلومات job؛ حقول backend أوسع من نموذج create/edit المفحوص. | B02–B03، E01 | OPEN |
| J1-03 | DISCONNECTED | requirement النصي والسياق على Lead لا يظهران كمدخل study في Opportunity/Scope Assist؛ leadId محفوظ، فلا ندّعي ضياع السجل. | A، E02/E04 | OPEN |
| J1-04 | INCOMPLETE | تكليف دراسة بتواريخ ومخرجات ومراجع ومُراجع غير موجود كعملية مكتملة في المسار؛ Activity/My Work يعملان. | A، E05 | OPEN |
| J1-05 | DISCONNECTED | Tender Technical يفتح Engineering العام الذي يعرض رابط رجوع إلى Tender، دون مساحة دراسة pre-award متكاملة؛ survey الحالي intake لإنشاء فرصة لا استكمال survey لفرصة قائمة. | B14، E06/E07 | OPEN |
| J1-06 | INCOMPLETE | drawings/specs/requirements لا تتجمع في technical study منظمة مع compliance/deviations/takeoff/sign-off. | E04/E06/E07 | OPEN |
| J1-07 | WRONG BEHAVIOR | scope author بلا approval يستطيع auto-approve أثناء create مع أن approve route يرفضه. | A، E03 | OPEN |
| J1-08 | WRONG BEHAVIOR | create estimate يقبل quantity من caller تختلف عن approved basis. | A، E03 | OPEN |
| J1-09 | WRONG BEHAVIOR | opportunity جديدة بلا package تستعمل مسار quote «legacy» وتجاوز الدراسة/estimate/frozen pricing. | A، E08 | OPEN |
| J1-10 | INCOMPLETE | commercial output صحيح حسابيًا، لكنه يستبدل وصف study بنص هامش داخلي وبند واحد دون عرض النطاق الهندسي. | A، E08/E09 | OPEN |
| J1-11 | INCOMPLETE | tender submit لا يتطلب technical study أو internal offer approval حسب رحلة المستخدم المطلوبة. | A، E06 | OPEN |
| J1-12 | CONFUSING | generic journey links لا تحافظ دائمًا على السجل؛ requirement UI مخفية داخل Commercial؛ approval copy لا يطابق المنع الفعلي. | B03–B07، E09 | OPEN |
| J1-13 | DISCONNECTED | Lead document action ينتقل إلى DMS عام؛ كامل إرفاق ثم وصول مهندس/معتمد إلى النسخة نفسها لم يثبت. | B04، E01 | OPEN |
| J1-14 | WRONG BEHAVIOR | عند تعايش quote legacy مع السلسلة governed للرقم نفسه، قراءة revisions من الأصل تعيد اثنتين ومن الابن واحدة رغم parent link صحيح؛ negotiation price movement يفقد المقارنة السابقة. | اختبار Auth ON الممتد، E08/E10 | OPEN |

لم نستخدم DUPLICATED لمجرد وجود snapshots أو revisions؛ هذه قد تكون صحيحة معماريًا. خطر إعادة الإدخال في J1-03/05 لا يثبت أن جميع البيانات تتكرر تلقائيًا. ولم نستخدم MISSING لمجرد تعذر صفحة بسبب انتهاء الجلسة.

## الدليل التقني المرتبط بالرحلة

| Ref | Backend / Domain / API / UI الذي فُحص | علاقة الدليل |
| --- | --- | --- |
| E01 | [Lead service](../../modules/crm/src/lead.service.ts)، [Lead API](../../apps/api/src/crm/crm-leads.controller.ts)، [default roles](../../core/src/identity/access.service.ts)، [capture](../../apps/web/components/lead-capture.tsx)، [Lead 360](../../apps/web/components/lead-360-client.tsx) | intake/qualification/assignment UI وصلاحيات الخدمة |
| E02 | [Lead conversion](../../modules/crm/src/lead-conversion.service.ts)، [conversion drawer](../../apps/web/components/lead-convert-drawer.tsx)، [Opportunity 360](../../apps/api/src/crm/opportunity-360.controller.ts) | Account/Contact matching، lead lineage، شكل handoff |
| E03 | [Package API](../../apps/api/src/crm/pre-award-package.controller.ts)، [package service](../../modules/crm/src/pre-award-package.service.ts)، [package domain](../../modules/crm/src/domain/pre-award-package.ts)، [permission derivation](../../core/src/identity/permissions.guard.ts) | inline approval وcaller quantities، canonical update، package transitions |
| E04 | [Requirements/scope](../../modules/crm/src/domain/solution-scope.ts)، [pre-award API](../../apps/api/src/crm/pre-award.controller.ts)، [Scope Assist evidence](../../modules/crm/src/scope-assist.service.ts)، [evidence UI](../../apps/web/components/scope-evidence-card.tsx) | بيانات الدراسة، allowed evidence pool وstaleness |
| E05 | [Activities API](../../apps/api/src/crm/crm-activities.controller.ts)، [reference validation](../../apps/api/src/crm/activity-reference.service.ts)، [My Work composition](../../apps/api/src/work-items/work-items.service.ts) | مهمة مرجعية وإسناد فعلي، بدون بناء task engine جديد |
| E06 | [Tender API](../../apps/api/src/tendering/tendering.controller.ts)، [Tender service](../../modules/tendering/src/tender.service.ts)، [gates](../../modules/tendering/src/domain/tender-gate.ts)، [clarifications](../../modules/tendering/src/domain/clarification.ts)، [submission](../../modules/tendering/src/domain/submission.ts) | intake/files/clarifications/submission/award، وحدود approval gate |
| E07 | [Survey domain](../../modules/site/src/domain/survey.ts)، [survey reactor](../../apps/api/src/events/cross-module-subscriber.ts)، [Tender launcher](../../apps/web/components/tender-360-context.tsx)، [study panel](../../apps/web/components/tender-study-panel.tsx) | سياق study مقابل delivery، source ownership |
| E08 | [Opportunity-to-quote API](../../apps/api/src/crm/crm-opportunities.controller.ts)، [Pricing→Quotation](../../modules/crm/src/pricing-quotation.service.ts)، [pricing domain](../../modules/crm/src/domain/pricing-sheet.ts)، [Quotation governance](../../modules/crm/src/quotation.service.ts) | legacy branch، immutable money، identity revisions، SoD/readiness |
| E09 | [Commercial panel](../../apps/web/components/commercial-panel.tsx)، [Estimation workspace](../../apps/web/components/estimation-workspace.tsx)، [Pricing workspace](../../apps/web/components/package-pricing-workspace.tsx)، [sales journey links](../../apps/web/components/sales-360-journey.tsx) | next action، حفظ context في الصفحات مقابل فقده في بعض الروابط العامة |
| E10 | [Negotiation API](../../apps/api/src/crm/negotiation.controller.ts)، [BFF](../../apps/web/app/api/crm/negotiation/route.ts)، [existing journey spec](../../apps/web/e2e/journey-signal-to-close.spec.ts) | مصدر price movement؛ existing spec API-driven وبعضه يحتاج second actor فلا يُعد browser acceptance تلقائيًا |

## نتيجة الاختبارات الحالية

**9 ملفات / 61 اختبارًا نجحت** في `.aura-j1-final.log`. تتضمن ثمانية ملفات HTTP قائمة وملف characterization جديد مع Auth ON. هذا النجاح يعني أن الاختبارات نفذت كما هو موضح؛ ليس موافقة على السلوك الخاطئ الملتقط في observations.

[الاختبار الجديد القابل لإعادة التشغيل](../../apps/api/test/j1-journey-audit.e2e-spec.ts) و[النتائج المحفوظة JSON](2026-09-13-j1-auth-observations.json).

| نقطة الإثبات الجديدة | النتيجة |
| --- | --- |
| Sales default role create / qualify / convert | 403 / 403 / 403 |
| Lead → Opportunity identity | leadId preserved؛ requirements list=0 رغم requirement محفوظ على Lead |
| Manual engineer assignment | My Work 200؛ المهمة المربوطة بالفرصة ظهرت للمكلّف |
| Scope author دون approvepermission | explicit approve=403؛ create `approve:true`=201/status approved |
| Canonical approved quantity مقابل caller estimate | approved=24؛ caller=240؛ create=201؛ estimatedCost=24000 |
| Quote قبل إنشاء package للفرصة الجديدة | 201 |
| المسار المالي الصحيح | 24×100=2400 cost → 20% margin → 3000 sell → 3150 total |
| Generated customer line | quantity=1، description=`Selling price — 20% target margin` |
| Re-generate same frozen pricing | نفس quotationId |
| Quotation governance | self-approval=403؛ before evidence=409؛ second fixture approver بعد checklist → approved |
| Tender submission بدون study/internal offer approval | 201/status submitted |

الدليل المستخدم للـchecklist افتراضي داخل DMS الاختبار، مع مراجع vendor خارجية معلنة كfixtures. يثبت آلية readiness، لا جودة مستند فني ولا استلام عميل. الهويات المستخدمة للمسار المالي الكامل fixture administrators؛ لا تُحسب كدور Engineer/Estimator معتمد في الشركة.

لم نعد تشغيل build شامل لأن هذه الجولة لم تغيّر كود المنتج؛ تغييراتها report وtest فقط. نتائج build/typecheck القديمة لا تُقدّم كتأكيد جديد لـJ1. لم يجر اختبار PostgreSQL أو external email/portal أو مجموعة أنظمة CCTV/Access/BMS/EMS/MEP كاملة.

## إضافة التحقق — 14 سبتمبر

أُعيد تشغيل ملف characterization الممتد وحده: **ملف واحد / اختبار واحد ناجح** في `.aura-j1-continuation.log`، مع Auth ON. نتائج 9 ملفات / 61 اختبارًا أعلاه تخص الجولة السابقة، ولم تُعد جميعها في هذه الإضافة. النجاح هنا يعني إعادة إنتاج السلوك، بما فيه العيوب المفتوحة، وليس قبولها. [observations لهذه الجولة](2026-09-14-j1-auth-observations.json).

المسار المعزول: عرض 3000 قبل الضريبة → تسجيل طلب خصم 5% → revision تسعير ينتج 2880 (خفض فعلي 4%) → عرض جديد مرتبط بالأصل وحالته draft → محاولة send مبكرة مرفوضة 400 → checklist جديد واعتماد من مستخدم ثانٍ → send ثم accepted. هذه تغييرات حالة محلية، وليست إرسالًا لعميل أو قبولًا حقيقيًا منه. طلب الخصم لا يغيّر السعر تلقائيًا، وهذا فصل صحيح.

في الحالة نفسها، API revisions من الأصل أعاد سجلين، ومن الابن سجلًا واحدًا. سبب J1-14 في `QuotationService.listRevisions`: مجموعة منع الدورات المستخدمة للصعود تحتوي الابن مسبقًا، ثم تُستخدم للنزول فتستبعده. fallback يخفي العيب حين تكون أرقام revisions فريدة؛ وجود legacy revision 0 وgoverned revision 0 يجعل fallback يعيد السجل الحالي وحده. سجل التفاوض الناتج يعرض total=3024 وdelta=0 بدل مقارنة إجمالي الأصل 3150 بالجديد 3024. لا نعمّم ذلك على كل سلسلة مراجعات.

**السجل الآن 14 فجوة مفتوحة.** لم تتغير وظائف المنتج في هذه الجولة. يبدأ ترتيب الإصلاح من Intake → Technical handoff، ثم سلامة scope/quantity/approval/output/revision داخل J1. الاختبار الحالي يستخدم fixture administrators لاستكمال المسار بعد عائق Sales؛ إثبات عمل الموظفين بالمتصفح ما زال غير مكتمل.

## سجل النتائج السابقة المؤجلة

| ID | النتيجة السابقة | موضع العودة | الحالة |
| --- | --- | --- | --- |
| DEFER-01 | PO approval bypass | J3 Engineering → Procurement | محفوظة OPEN، لم تُصلح |
| DEFER-02 | stock movement dedupe/return quantities | J3 material delivery ثم J4 consumption | محفوظة OPEN، لم تُصلح |
| DEFER-03 | partial receipt mislabeled | J3 | محفوظة OPEN |
| DEFER-04 | supplier update validation | J3 | محفوظة OPEN |
| DEFER-05 | procurement cost coding/line depth/dashboard totals | J3، مع أثر J5 | محفوظة OPEN |
| DEFER-06 | HR policy applicability وبقية supporting capabilities | رحلة دعم مناسبة بعد الاتفاق على J1–J6 | محفوظة OPEN |

التفاصيل والأدلة الأصلية في [depth audit](2026-09-13-business-capability-depth-audit.md). خطورة النتائج لا تختفي بتأجيلها؛ تغيير الترتيب هو قرار العمل الحالي.

## الخطوة التالية وحدود الإغلاق

استُكملت القراءة الحية بعد استعادة الجلسة. يبقى إثبات J1 مع هوّيات Sales وPre-Sales/Estimator وApprover وصلاحياتها المتفق عليها. حساب admin ليس بديلًا عنها. نثبت التكليف واستلامه من inbox، فتح source documents، الدراسة والclarifications، نطاقًا معتمدًا، التقدير والتسعير، اعتماد العرض، preview، مراجعة وتفاوض وaward/loss على **نفس job**.

بعد فهم الرحلة، أول حزمة إصلاح داخل J1 تكون **Intake → Technical handoff**: إصلاح J1-01 دون منح Sales صلاحيات إدارية عامة، وربط بيانات Lead بالstudy، وتحديد تكليف الدراسة باستخدام Activities/My Work القائمة. بالتوازي المنطقي داخل نفس سلسلة الاعتماد، تُعالج J1-07/08/09 قبل اعتبار approved offer موثوقًا؛ لا ننقل الأولوية إلى Procurement.

معيار قبول J1: موظف Sales يسجل enquiry؛ المهندس يستلم ما يجب دراسته ومراجعه؛ المقدّر يستخدم canonical approved quantities؛ الإدارة ترى الحزمة والمراجعة نفسها التي ستُرسل؛ العميل يرى وصف نطاق مناسبًا دون بيانات margin داخلية؛ أي revision يحفظ lineage ويعيد الاعتماد حيث يلزم. تثبت الحالات المسموحة والمرفوضة بالـAPI مع Auth ON، ويثبت browser أن الموظفين يستطيعون تنفيذها فعلًا.

عندها فقط نتابع نفس job إلى **J2 Award → Mobilisation → Engineering Release**، ثم J3، J4، J5، J6 بالترتيب الذي حدده المستخدم. **J1 لم تُغلق في هذه الجولة.**
