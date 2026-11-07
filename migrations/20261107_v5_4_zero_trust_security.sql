-- ============================================================================
-- نظام موكّل (Moakkil System) - 2026
-- الملف: migrations/20261107_v5_4_zero_trust_security.sql
-- الوصف: ترقيع أمني شامل لقاعدة البيانات (Supabase PostgreSQL / pgvector / RLS)
-- يعالج جميع ملاحظات تقرير إعادة التقييم (7 نوفمبر 2026 - القسم الرابع):
--   1. تحديث دالة search_legal_brain لتقبل 4 معاملات (مع p_firm_id) وعزل وثائق المكاتب صراحةً.
--   2. سحب صلاحيات EXECUTE من PUBLIC و anon على دوال SECURITY DEFINER المساعدة.
--   3. إزالة سياسات RLS المتداخلة والمكررة (SELECT مقابل ALL) في الجداول الخمسة.
-- ============================================================================

BEGIN;

-- ============================================================================
-- [0] التأكد من وجود عمود pin_code في جدول mo_users (للمصادقة الإجرائية الاختيارية)
-- ============================================================================
ALTER TABLE public.mo_users ADD COLUMN IF NOT EXISTS pin_code text;

-- ============================================================================
-- [1] إصلاح وتأمين دالة البحث الدلالي في العقل القانوني (search_legal_brain)
-- ============================================================================
-- حذف التوقيع القديم ذي الـ 3 معاملات لمنع الالتباس في PostgREST RPC
DROP FUNCTION IF EXISTS public.search_legal_brain(public.vector, double precision, integer);
DROP FUNCTION IF EXISTS public.search_legal_brain(public.vector, double precision, integer, uuid);

CREATE OR REPLACE FUNCTION public.search_legal_brain(
    query_embedding public.vector,
    match_threshold double precision,
    match_count integer,
    p_firm_id uuid DEFAULT NULL
)
RETURNS TABLE(
    id uuid,
    firm_id uuid,
    category text,
    article_number text,
    title text,
    original_text text,
    ai_summary text,
    similarity double precision
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_jwt_firm uuid := public.mo_current_firm_id();
    v_effective_firm uuid;
BEGIN
    -- إذا تم الاستدعاء عبر JWT لمكتب محدد نلزم به، وإذا تم عبر Service Role من الوركر نعتمد p_firm_id الممرر
    v_effective_firm := COALESCE(v_jwt_firm, p_firm_id);

    RETURN QUERY
    SELECT
        lb.id,
        lb.firm_id,
        lb.category,
        lb.article_number,
        lb.title,
        lb.original_text,
        lb.ai_summary,
        1 - (lb.embedding <=> query_embedding) AS similarity
    FROM public.legal_brain lb
    WHERE 1 - (lb.embedding <=> query_embedding) > match_threshold
      AND (
          -- الوثائق التشريعية العامة المشتركة فقط (التي ليس لها firm_id ومسموح بنشرها)
          (lb.firm_id IS NULL AND COALESCE(lb.is_public, true) = true)
          OR
          -- أو الوثائق والقوالب الخاصة بالمكتب المحدد حصراً (لن ترجع وثائق كل المكاتب أبداً عند غياب المعرف)
          (v_effective_firm IS NOT NULL AND lb.firm_id = v_effective_firm)
      )
    ORDER BY lb.embedding <=> query_embedding
    LIMIT LEAST(GREATEST(COALESCE(match_count, 5), 1), 25);
END;
$function$;

-- تقييد صلاحية استدعاء دوال البحث الدلالي على الأدوار الموثقة فقط (منع PUBLIC و anon)
REVOKE ALL ON FUNCTION public.search_legal_brain(public.vector, double precision, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_legal_brain(public.vector, double precision, integer, uuid) TO authenticated, service_role;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'match_cases'
    ) THEN
        EXECUTE 'REVOKE ALL ON FUNCTION public.match_cases(public.vector, double precision, integer, uuid) FROM PUBLIC, anon';
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.match_cases(public.vector, double precision, integer, uuid) TO authenticated, service_role';
    END IF;
END $$;

-- ============================================================================
-- [2] سحب صلاحيات EXECUTE من PUBLIC و anon على دوال SECURITY DEFINER المساعدة
-- ============================================================================
REVOKE ALL ON FUNCTION public.mo_jwt_claims() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mo_jwt_claims() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.mo_current_firm_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mo_current_firm_id() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.mo_current_user_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mo_current_user_id() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.mo_current_user_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mo_current_user_role() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.mo_can_access_case(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mo_can_access_case(uuid) TO authenticated, service_role;

-- ============================================================================
-- [3] تنظيف وتوحيد سياسات RLS المكررة والمتداخلة في الجداول الخمسة
-- ============================================================================

-- 3.1 جدول المواعيد والمهام (mo_appointments)
DROP POLICY IF EXISTS mo_appointments_select_policy ON public.mo_appointments;
DROP POLICY IF EXISTS mo_appointments_write_policy ON public.mo_appointments;
DROP POLICY IF EXISTS mo_appointments_insert_policy ON public.mo_appointments;
DROP POLICY IF EXISTS mo_appointments_update_policy ON public.mo_appointments;
DROP POLICY IF EXISTS mo_appointments_delete_policy ON public.mo_appointments;

CREATE POLICY mo_appointments_select_policy ON public.mo_appointments
    FOR SELECT TO authenticated
    USING (
        (firm_id = public.mo_current_firm_id())
        AND ((related_case_id IS NULL) OR public.mo_can_access_case(related_case_id))
    );

CREATE POLICY mo_appointments_insert_policy ON public.mo_appointments
    FOR INSERT TO authenticated
    WITH CHECK (
        (firm_id = public.mo_current_firm_id())
        AND ((related_case_id IS NULL) OR public.mo_can_access_case(related_case_id))
    );

CREATE POLICY mo_appointments_update_policy ON public.mo_appointments
    FOR UPDATE TO authenticated
    USING (
        (firm_id = public.mo_current_firm_id())
        AND ((related_case_id IS NULL) OR public.mo_can_access_case(related_case_id))
    )
    WITH CHECK (
        (firm_id = public.mo_current_firm_id())
        AND ((related_case_id IS NULL) OR public.mo_can_access_case(related_case_id))
    );

CREATE POLICY mo_appointments_delete_policy ON public.mo_appointments
    FOR DELETE TO authenticated
    USING (
        (firm_id = public.mo_current_firm_id())
        AND ((related_case_id IS NULL) OR public.mo_can_access_case(related_case_id))
    );

-- 3.2 جدول إجراءات وتحديثات القضايا (mo_case_updates)
DROP POLICY IF EXISTS mo_case_updates_select_policy ON public.mo_case_updates;
DROP POLICY IF EXISTS mo_case_updates_write_policy ON public.mo_case_updates;
DROP POLICY IF EXISTS mo_case_updates_insert_policy ON public.mo_case_updates;
DROP POLICY IF EXISTS mo_case_updates_update_policy ON public.mo_case_updates;
DROP POLICY IF EXISTS mo_case_updates_delete_policy ON public.mo_case_updates;

CREATE POLICY mo_case_updates_select_policy ON public.mo_case_updates
    FOR SELECT TO authenticated
    USING (
        (firm_id = public.mo_current_firm_id())
        AND public.mo_can_access_case(case_id)
    );

CREATE POLICY mo_case_updates_insert_policy ON public.mo_case_updates
    FOR INSERT TO authenticated
    WITH CHECK (
        (firm_id = public.mo_current_firm_id())
        AND public.mo_can_access_case(case_id)
    );

CREATE POLICY mo_case_updates_update_policy ON public.mo_case_updates
    FOR UPDATE TO authenticated
    USING (
        (firm_id = public.mo_current_firm_id())
        AND public.mo_can_access_case(case_id)
    )
    WITH CHECK (
        (firm_id = public.mo_current_firm_id())
        AND public.mo_can_access_case(case_id)
    );

CREATE POLICY mo_case_updates_delete_policy ON public.mo_case_updates
    FOR DELETE TO authenticated
    USING (
        (firm_id = public.mo_current_firm_id())
        AND public.mo_can_access_case(case_id)
    );

-- 3.3 جدول المصاريف المالية (mo_expenses)
DROP POLICY IF EXISTS mo_expenses_select_policy ON public.mo_expenses;
DROP POLICY IF EXISTS mo_expenses_write_policy ON public.mo_expenses;
DROP POLICY IF EXISTS mo_expenses_insert_policy ON public.mo_expenses;
DROP POLICY IF EXISTS mo_expenses_update_policy ON public.mo_expenses;
DROP POLICY IF EXISTS mo_expenses_delete_policy ON public.mo_expenses;

CREATE POLICY mo_expenses_select_policy ON public.mo_expenses
    FOR SELECT TO authenticated
    USING (
        (firm_id = public.mo_current_firm_id())
        AND public.mo_can_access_case(case_id)
    );

CREATE POLICY mo_expenses_insert_policy ON public.mo_expenses
    FOR INSERT TO authenticated
    WITH CHECK (
        (firm_id = public.mo_current_firm_id())
        AND public.mo_can_access_case(case_id)
    );

CREATE POLICY mo_expenses_update_policy ON public.mo_expenses
    FOR UPDATE TO authenticated
    USING (
        (firm_id = public.mo_current_firm_id())
        AND public.mo_can_access_case(case_id)
    )
    WITH CHECK (
        (firm_id = public.mo_current_firm_id())
        AND public.mo_can_access_case(case_id)
    );

CREATE POLICY mo_expenses_delete_policy ON public.mo_expenses
    FOR DELETE TO authenticated
    USING (
        (firm_id = public.mo_current_firm_id())
        AND public.mo_can_access_case(case_id)
    );

-- 3.4 جدول الملفات والأرشيف السحابي (mo_files)
DROP POLICY IF EXISTS mo_files_select_policy ON public.mo_files;
DROP POLICY IF EXISTS mo_files_write_policy ON public.mo_files;
DROP POLICY IF EXISTS mo_files_insert_policy ON public.mo_files;
DROP POLICY IF EXISTS mo_files_update_policy ON public.mo_files;
DROP POLICY IF EXISTS mo_files_delete_policy ON public.mo_files;

CREATE POLICY mo_files_select_policy ON public.mo_files
    FOR SELECT TO authenticated
    USING (
        (firm_id = public.mo_current_firm_id())
        AND ((case_id IS NULL) OR public.mo_can_access_case(case_id))
    );

CREATE POLICY mo_files_insert_policy ON public.mo_files
    FOR INSERT TO authenticated
    WITH CHECK (
        (firm_id = public.mo_current_firm_id())
        AND ((case_id IS NULL) OR public.mo_can_access_case(case_id))
    );

CREATE POLICY mo_files_update_policy ON public.mo_files
    FOR UPDATE TO authenticated
    USING (
        (firm_id = public.mo_current_firm_id())
        AND ((case_id IS NULL) OR public.mo_can_access_case(case_id))
    )
    WITH CHECK (
        (firm_id = public.mo_current_firm_id())
        AND ((case_id IS NULL) OR public.mo_can_access_case(case_id))
    );

CREATE POLICY mo_files_delete_policy ON public.mo_files
    FOR DELETE TO authenticated
    USING (
        (firm_id = public.mo_current_firm_id())
        AND ((case_id IS NULL) OR public.mo_can_access_case(case_id))
    );

-- 3.5 جدول الدفعات والأقساط المالية (mo_installments)
DROP POLICY IF EXISTS mo_installments_select_policy ON public.mo_installments;
DROP POLICY IF EXISTS mo_installments_write_policy ON public.mo_installments;
DROP POLICY IF EXISTS mo_installments_insert_policy ON public.mo_installments;
DROP POLICY IF EXISTS mo_installments_update_policy ON public.mo_installments;
DROP POLICY IF EXISTS mo_installments_delete_policy ON public.mo_installments;

CREATE POLICY mo_installments_select_policy ON public.mo_installments
    FOR SELECT TO authenticated
    USING (
        (firm_id = public.mo_current_firm_id())
        AND public.mo_can_access_case(case_id)
    );

CREATE POLICY mo_installments_insert_policy ON public.mo_installments
    FOR INSERT TO authenticated
    WITH CHECK (
        (firm_id = public.mo_current_firm_id())
        AND public.mo_can_access_case(case_id)
    );

CREATE POLICY mo_installments_update_policy ON public.mo_installments
    FOR UPDATE TO authenticated
    USING (
        (firm_id = public.mo_current_firm_id())
        AND public.mo_can_access_case(case_id)
    )
    WITH CHECK (
        (firm_id = public.mo_current_firm_id())
        AND public.mo_can_access_case(case_id)
    );

CREATE POLICY mo_installments_delete_policy ON public.mo_installments
    FOR DELETE TO authenticated
    USING (
        (firm_id = public.mo_current_firm_id())
        AND public.mo_can_access_case(case_id)
    );

COMMIT;
