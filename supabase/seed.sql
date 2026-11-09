-- =====================================================================
-- Reference data (every environment, including production).
-- Idempotent: safe to run again; existing rows are left untouched.
--   local/dev : applied automatically by `supabase db reset` / `db push --include-seed`
--   production: npx supabase db query --remote --yes -f supabase/seed.sql   (see docs/runbooks/production.md)
-- Demo users live in seed.dev.sql and must NEVER be applied to production.
-- =====================================================================

-- ------------------------------------------------------- reference lists
insert into public.reference_lists (list_key, value, label, parent_value, extra, sort_order) values
  ('entity_type','commercial','{"pt":"Entidades Comerciais (Com Fins Lucrativos)","en":"Commercial entities (for profit)"}',null,'{}',1),
  ('entity_type','nonprofit','{"pt":"Entidades Sem Fins Lucrativos (Sociais)","en":"Non-profit entities"}',null,'{}',2),
  ('entity_type','public','{"pt":"Entidades Públicas","en":"Public entities"}',null,'{}',3),
  ('entity_type','other','{"pt":"Outras","en":"Other"}',null,'{}',4),
  ('entity_subtype','ei','{"pt":"Empresário em Nome Individual (E.I.)","en":"Sole trader (E.I.)"}','commercial','{}',1),
  ('entity_subtype','snc','{"pt":"Sociedade em Nome Colectivo de Responsabilidade Limitada","en":"General partnership"}','commercial','{}',2),
  ('entity_subtype','lda','{"pt":"Sociedade por Quotas","en":"Private limited company (Lda)"}','commercial','{}',3),
  ('entity_subtype','sa','{"pt":"Sociedade Anónima","en":"Public limited company (SA)"}','commercial','{}',4),
  ('entity_subtype','sas','{"pt":"Sociedade por Acções Simplificada","en":"Simplified joint-stock company"}','commercial','{}',5),
  ('entity_subtype','holding','{"pt":"Holding","en":"Holding"}','commercial','{}',6),
  ('entity_subtype','foreign_rep','{"pt":"Representação Comercial Estrangeira","en":"Foreign commercial representation"}','commercial','{}',7),
  ('entity_subtype','public_company','{"pt":"Empresa Pública","en":"Public company"}','commercial','{}',8),
  ('entity_subtype','association','{"pt":"Associações","en":"Associations"}','nonprofit','{}',1),
  ('entity_subtype','foundation','{"pt":"Fundações","en":"Foundations"}','nonprofit','{}',2),
  ('entity_subtype','ngo','{"pt":"ONGs (Organizações Não Governamentais)","en":"NGOs"}','nonprofit','{}',3),
  ('entity_subtype','cooperative','{"pt":"Cooperativas","en":"Cooperatives"}','nonprofit','{}',4),
  ('entity_subtype','public_enterprise','{"pt":"Empresas Públicas","en":"Public enterprises"}','public','{}',1),
  ('entity_subtype','institute','{"pt":"Institutos","en":"Institutes"}','public','{}',2),
  ('entity_subtype','agency','{"pt":"Agências","en":"Agencies"}','public','{}',3),
  ('entity_subtype','municipality','{"pt":"Autarquias","en":"Municipalities"}','public','{}',4),
  ('entity_subtype','other','{"pt":"Outro","en":"Other"}','other','{}',1),
  ('company_size','micro','{"pt":"Micro empresa","en":"Micro company"}',null,'{"definition":{"pt":"Até 10 trabalhadores","en":"Up to 10 employees"}}',1),
  ('company_size','pequena','{"pt":"Pequena empresa","en":"Small company"}',null,'{"definition":{"pt":"11 a 30 trabalhadores","en":"11 to 30 employees"}}',2),
  ('company_size','media','{"pt":"Média empresa","en":"Medium company"}',null,'{"definition":{"pt":"31 a 100 trabalhadores","en":"31 to 100 employees"}}',3),
  ('company_size','grande','{"pt":"Grande empresa","en":"Large company"}',null,'{"definition":{"pt":"Mais de 100 trabalhadores","en":"More than 100 employees"}}',4)
on conflict do nothing;

insert into public.reference_lists (list_key, value, label, sort_order)
select 'province', v, jsonb_build_object('pt', v, 'en', v), ord
  from unnest(array['Cabo Delgado','Niassa','Nampula','Zambézia','Tete','Manica','Sofala','Inhambane','Gaza',
                    'Maputo Província','Maputo Cidade']) with ordinality as t(v, ord)
on conflict do nothing;

insert into public.reference_lists (list_key, value, label, sort_order)
select 'sector', ord::text, jsonb_build_object('pt', ord || '. ' || pt, 'en', ord || '. ' || en), ord
  from unnest(
    array['Agricultura, produção animal, caça, floresta e pesca','Indústrias extractivas','Indústrias transformadoras',
          'Electricidade, gás, vapor, água quente e fria e ar frio',
          'Captação, tratamento e distribuição de água; saneamento, gestão de resíduos e despoluição','Construção',
          'Comércio por grosso e a retalho; reparação de veículos automóveis e motociclos','Transportes e armazenagem',
          'Alojamento, restauração e similares','Actividades de informação e de comunicação',
          'Actividades financeiras e de seguros','Actividades imobiliárias',
          'Actividades de consultoria, científicas, técnicas e similares','Actividades administrativas e dos serviços de apoio',
          'Administração Pública e Defesa; Segurança Social Obrigatória','Educação',
          'Actividades de saúde humana e acção social','Actividades artísticas, de espectáculos, desportivas e recreativas',
          'Outras actividades de serviços',
          'Actividades das famílias empregadoras de pessoal doméstico e actividades de produção das famílias para uso próprio',
          'Actividades dos organismos internacionais e de outras instituições extra-territoriais'],
    array['Agriculture, forestry and fishing','Mining and quarrying','Manufacturing',
          'Electricity, gas, steam and air conditioning supply','Water supply, sewerage and waste management','Construction',
          'Wholesale and retail trade; repair of motor vehicles','Transportation and storage',
          'Accommodation and food service','Information and communication','Financial and insurance activities',
          'Real estate activities','Professional, scientific and technical activities','Administrative and support services',
          'Public administration and defence; compulsory social security','Education','Human health and social work',
          'Arts, entertainment and recreation','Other service activities','Activities of households as employers',
          'Extraterritorial organisations']) with ordinality as t(pt, en, ord)
on conflict do nothing;

insert into public.reference_lists (list_key, value, label, sort_order)
select 'notification_day', d::text, jsonb_build_object('pt', d || ' dias', 'en', d || ' days'), ord
  from unnest(array[90,60,30,15,1]) with ordinality as t(d, ord)
on conflict do nothing;

-- ------------------------------------------------------ platform settings
insert into public.platform_settings (key, value) values
  ('trial_days', '14'), ('grace_days', '7'), ('recycle_days', '30'), ('max_file_size_bytes', '20971520'),
  ('bo_otp', 'false'), ('document_otp_default', 'false'), ('ai_enabled_global', 'true'),
  ('ai_welcome', '{"pt":"Faça perguntas sobre as checklists e documentos desta conta.","en":"Ask questions about this account''s checklists and documents."}'),
  ('ai_suggestions', '{"pt":["Que documentos expiram nos próximos 90 dias?"],"en":["Which documents expire in the next 90 days?"]}'),
  ('quota_warnings_enabled', 'true'),
  ('claude_model', '"claude-sonnet-5-5"')
on conflict do nothing;

-- ------------------------------------------------------------------ plans
insert into public.plans (slug, name, description, sort_order, max_users, max_branches, max_documents, max_storage_bytes,
                          max_ocr, max_ia, trial_days, allows_assisted_ia, extra_user_price, extra_branch_price, translations) values
  ('trial','Trial','Plano experimental gratuito por 14 dias.',1, 1, 0, 102, 214748364, 10, 10, 14, false, null, null,
     '{"en":{"name":"Trial","description":"Free 14-day trial plan."}}'),
  ('essencial','Essencial','Plano essencial para pequenas empresas.',2, 3, 0, 1024, 2147483648, 20, 0, null, false, null, null,
     '{"en":{"name":"Essential","description":"Essential plan for small companies."}}'),
  ('profissional','Profissional','Plano avançado com sucursais, OCR ilimitado e Assistente de IA.',3, 5, 3, 5120, 10737418240, null, 100, null, true, 1000, 500,
     '{"en":{"name":"Professional","description":"Advanced plan with branches, unlimited OCR and AI assistant."}}'),
  ('empresarial','Empresarial','Plano corporativo com sucursais ilimitadas e IA ilimitada.',4, 10, null, 25600, 53687091200, null, null, null, true, 300, null,
     '{"en":{"name":"Enterprise","description":"Corporate plan with unlimited branches and AI."}}')
on conflict do nothing;

insert into public.plan_prices (plan_id, period, amount)
select p.id, x.period::public.billing_period, x.amount
  from public.plans p
  join (values ('trial','monthly',0),
               ('essencial','monthly',2000),('essencial','semestral',10800),('essencial','annual',19200),
               ('profissional','monthly',3500),('profissional','semestral',18900),('profissional','annual',33600),
               ('empresarial','monthly',8500),('empresarial','semestral',45900),('empresarial','annual',81600)
       ) as x(slug, period, amount) on x.slug = p.slug
on conflict do nothing;

insert into public.addons (code, amount) values ('storage_5gb', 300), ('extra_user', 1000), ('extra_branch', 500)
on conflict do nothing;

-- ------------------------------------------- default template "Obrigações Gerais" v1
do $$
declare v_tpl uuid; v_ver uuid; c record; v_cat uuid;
begin
  if exists (select 1 from public.checklist_templates where name = 'Obrigações Gerais' and organization_id is null) then
    return;   -- already installed
  end if;
  insert into public.checklist_templates (name, description, sector, status)
  values ('Obrigações Gerais', 'Catálogo de conformidade da entidade.', null, 'published') returning id into v_tpl;
  insert into public.template_versions (template_id, version_number) values (v_tpl, 1) returning id into v_ver;

  for c in select * from (values
      (1,'Legal','Dados constitutivos da sociedade','Legal','Company incorporation data'),
      (2,'Societário','Órgãos sociais, mandatos, actas e Boletim da República','Corporate','Corporate bodies, mandates, minutes and Official Gazette'),
      (3,'Licenciamento','Alvarás e licença de impacto ambiental','Licensing','Licences and environmental impact licence'),
      (4,'Fiscal','NUIT, início de actividade e obrigações','Tax','Tax ID, start of activity and obligations'),
      (5,'Direitos de PI','Marcas e patentes','IP rights','Trademarks and patents')) as t(ord, title, descr, en_title, en_descr)
  loop
    insert into public.template_items (version_id, is_category, catalog_group, title, description, translations, sort_order)
    values (v_ver, true, c.title, c.title, c.descr,
            jsonb_build_object('en', jsonb_build_object('title', c.en_title, 'description', c.en_descr)), c.ord)
    returning id into v_cat;

    insert into public.template_items (version_id, parent_id, catalog_group, catalog_code, title, translations,
                                       has_validity, requires_attachment, applicability, answer_kind, bound_field, sort_order)
    select v_ver, v_cat, c.title, i.code, i.title, jsonb_build_object('en', jsonb_build_object('title', i.en)),
           i.validity, i.attach, i.app::public.applicability, i.kind::public.answer_kind, i.bound, i.ord
      from (values
        ('Legal','LEG-01','Nome da Entidade','Entity name',false,true,'yes','text',null,1),
        ('Legal','LEG-02','Tipo de Entidade Legal','Legal entity type',false,false,'yes','text',null,2),
        ('Legal','LEG-03','Número da Entidade Legal (NUEL)','Legal entity number (NUEL)',false,false,'yes','text',null,3),
        ('Legal','LEG-04','Data da Constituição','Incorporation date',false,false,'yes','text',null,4),
        ('Legal','LEG-05','Capital Social Subscrito','Subscribed share capital',false,false,'yes','text',null,5),
        ('Legal','LEG-06','Capital Social Realizado','Paid-up share capital',false,false,'yes','text',null,6),
        ('Legal','LEG-07','Sócios / Accionistas','Partners / shareholders',false,true,'yes','shareholders','shareholders',7),
        ('Legal','LEG-08','Endereço da Sociedade','Registered address',false,true,'yes','text',null,8),
        ('Legal','LEG-09','Tem Sucursais','Has branches',false,false,'depends','text',null,9),
        ('Legal','LEG-10','Objecto','Corporate purpose',false,false,'yes','social_object','social_object',10),
        ('Legal','LEG-11','Beneficiário Efectivo','Beneficial owner',true,true,'yes','text',null,11),
        ('Legal','LEG-12','Setor de Atividade','Activity sector',false,false,'yes','sector','sector',12),
        ('Societário','SOC-01','Administração da Sociedade','Company management',true,true,'yes','text',null,1),
        ('Societário','SOC-02','Administradores / Directores','Directors',true,true,'yes','text',null,2),
        ('Societário','SOC-03','Mandato dos Administradores / Directores','Directors'' term of office',true,false,'yes','text',null,3),
        ('Societário','SOC-04','Mandatários / Procuradores / Representantes','Attorneys / representatives',true,true,'depends','text',null,4),
        ('Societário','SOC-05','Mesa da Assembleia Geral','General Meeting board',true,true,'yes','text',null,5),
        ('Societário','SOC-06','Presidente da Assembleia Geral','Chair of the General Meeting',true,true,'yes','text',null,6),
        ('Societário','SOC-07','Mandato dos Membros da Assembleia Geral','General Meeting members'' term',true,false,'yes','text',null,7),
        ('Societário','SOC-08','Conselho Fiscal ou Fiscal Único','Supervisory board or sole auditor',true,true,'depends','text',null,8),
        ('Societário','SOC-09','Presidente do Conselho Fiscal','Chair of the supervisory board',true,true,'depends','text',null,9),
        ('Societário','SOC-10','Mandato do Conselho Fiscal','Supervisory board term',true,false,'depends','text',null,10),
        ('Societário','SOC-11','Secretário da Sociedade','Company secretary',true,false,'depends','text',null,11),
        ('Societário','SOC-12','Mandato do Secretário da Sociedade','Company secretary term',true,false,'depends','text',null,12),
        ('Societário','SOC-13','Actas da Assembleia Geral','General Meeting minutes',false,true,'yes','text',null,13),
        ('Societário','SOC-14','Actas do Conselho de Administração','Board of directors minutes',false,true,'depends','text',null,14),
        ('Societário','SOC-15','Actas do Conselho Fiscal','Supervisory board minutes',false,true,'depends','text',null,15),
        ('Societário','SOC-16','Boletins da República','Official Gazette (Boletim da República)',true,true,'yes','text',null,16),
        ('Licenciamento','LIC-01','Actividade Principal (Alvará)','Main activity (licence)',true,true,'yes','text',null,1),
        ('Licenciamento','LIC-02','Actividade(s) Secundária(s) (Alvará)','Secondary activities (licence)',true,true,'depends','text',null,2),
        ('Licenciamento','LIC-03','Licença de Impacto Ambiental','Environmental impact licence',true,true,'depends','text',null,3),
        ('Licenciamento','LIC-04','Outro(s) Alvará(s)','Other licences',true,true,'depends','text',null,4),
        ('Fiscal','FIS-01','Número Único de Identificação Tributária (NUIT)','Tax identification number (NUIT)',false,true,'yes','text',null,1),
        ('Fiscal','FIS-02','Data de Início de Actividade Fiscal','Fiscal activity start date',false,true,'yes','text',null,2),
        ('Fiscal','FIS-03','Certidão de Quitação Fiscal (não dívida)','Tax clearance certificate',true,true,'depends','text',null,3),
        ('Fiscal','FIS-04','Tem Sucursal','Has a branch',false,false,'depends','text',null,4),
        ('Direitos de PI','PI-01','Registo de Marcas / Patentes Locais','Local trademark / patent registrations',true,true,'depends','text',null,1),
        ('Direitos de PI','PI-02','Registo de Marcas / Patentes Regionais','Regional trademark / patent registrations',true,true,'depends','text',null,2),
        ('Direitos de PI','PI-03','Registo de Marcas / Patentes Globais','Global trademark / patent registrations',true,true,'depends','text',null,3)
      ) as i(cat, code, title, en, validity, attach, app, kind, bound, ord)
     where i.cat = c.title;
  end loop;

  update public.template_versions set is_published = true, published_at = now() where id = v_ver;
end $$;

