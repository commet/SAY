import type { NoticeType } from "../core/types.js";

export interface ChecklistField {
  fieldKey: string; label: string; required: boolean; keywords: RegExp;
  whyItMatters: string; suggestedQuestion: string; actionLabel?: string; reminderText?: string;
}
const f = (fieldKey: string, label: string, required: boolean, keywords: RegExp, whyItMatters: string, suggestedQuestion: string, actionLabel?: string, reminderText?: string): ChecklistField =>
  ({ fieldKey, label, required, keywords, whyItMatters, suggestedQuestion, actionLabel, reminderText });

export const checklists: Record<NoticeType, ChecklistField[]> = {
  hospital: [
    f("appointment_date", "예약일", true, /검진일|예약일|진료일/, "날짜를 놓치면 일정을 다시 잡아야 할 수 있어요", "검진 예약일이 언제인지 확인해 주세요.", "병원 가기", "병원 갈 준비"),
    f("arrival_time", "도착 시간", true, /내원|도착|접수/, "접수 시간보다 늦으면 검사가 어려울 수 있어요", "몇 시까지 도착해야 하는지 병원에 물어보세요."),
    f("fasting_start", "금식 시작 시간", true, /금식|공복/, "금식 지침은 검사 종류에 따라 달라요", "물과 평소 약을 포함해 언제부터 금식인지 물어보세요.", "금식 시작 지키기", "금식 시작 10분 전"),
    f("medication_allowed", "평소 약 복용 가능 여부", true, /혈압약|당뇨약|복용.*약|약.*복용/, "평소 약 지침은 병원마다 달라요", "검진 당일 아침 평소 약을 복용해도 되나요?"),
    f("items_to_bring", "준비물", true, /신분증|지참|준비물/, "준비물이 없으면 접수가 지연될 수 있어요", "신분증 외에 가져갈 것이 있나요?", "준비물 챙기기", "신분증·준비물 챙길 시간"),
    f("guardian_needed", "보호자 동행 여부", false, /보호자|동행|수면내시경/, "검사 방식에 따라 보호자가 필요할 수 있어요", "보호자 동행이 필요한 검사인가요?"),
    f("precautions", "검사 전후 주의사항", false, /주의|삼가|피하/, "검사 전후 지침을 확인하면 재검을 피하는 데 도움이 돼요", "검사 전후 주의할 점이 있나요?"),
  ],
  government: [
    f("who_eligible", "신청 대상", true, /지원대상|신청대상|대상:/, "대상 조건을 먼저 확인해야 해요", "우리 가구가 신청 대상인지 문의해 주세요."),
    f("deadline", "신청 마감", true, /신청기간|마감|까지/, "기한 뒤에는 신청이 어려울 수 있어요", "정확한 신청 마감 시각을 문의해 주세요.", "기한 안에 신청하기", "신청 마감 전"),
    f("required_docs", "필요 서류", true, /필요서류|구비서류|준비서류/, "서류가 빠지면 다시 방문할 수 있어요", "제출할 서류 목록을 확인해 주세요."),
    f("how_to_submit", "제출 방법", true, /신청방법|제출방법|방문 신청|온라인 신청/, "방문과 온라인 중 가능한 방법을 알아야 해요", "어디에서 어떻게 신청하는지 문의해 주세요."),
    f("where", "신청 장소·링크", false, /행정복지센터|주민센터|https?:\/\//, "방문 장소나 공식 링크를 확인해야 해요", "신청할 정확한 장소나 공식 링크를 알려 주세요."),
    f("miss_consequence", "미신청 시 결과", false, /미신청|놓치면|받으실 수 없/, "기한을 놓쳤을 때의 영향을 알아야 해요", "기한을 놓치면 어떻게 되는지 문의해 주세요."),
    f("contact", "문의처", false, /문의|연락처|\d{2,3}-\d{3,4}-\d{4}/, "모호한 내용을 공식 기관에 확인할 수 있어요", "담당 기관 문의처를 확인해 주세요."),
  ],
  insurance_card_payment: [
    f("amount", "금액", true, /금액|보험료|청구|[\d,]+원/, "청구 금액을 확인해야 해요", "청구된 정확한 금액을 확인해 주세요."),
    f("due_date", "납부일", true, /납부일|결제일|출금일|까지/, "납부 기한을 놓치지 않게 확인해야 해요", "납부 기한을 확인해 주세요.", "납부 확인하기", "납부일 알림"),
    f("auto_debit", "자동이체 여부", true, /자동이체|자동납부/, "직접 납부가 필요한지 구분해야 해요", "자동이체로 처리되는지 확인해 주세요."),
    f("overdue_status", "미납·연체 여부", false, /미납|연체/, "미납 여부는 공식 고객센터에서 확인해야 해요", "미납 또는 연체 상태인지 공식 고객센터에 문의해 주세요."),
    f("needs_call", "고객센터 확인 필요", false, /고객센터|문의/, "공식 채널 확인이 필요한 내용일 수 있어요", "공식 고객센터 번호로 직접 확인해 주세요."),
    f("asks_personal_info", "개인정보·인증 요구", true, /주민등록번호|계좌번호|비밀번호|인증번호|카드번호/, "민감정보 요구는 공식 채널 여부를 먼저 확인해야 해요", "공식 앱이나 고객센터에서 같은 요청이 있는지 확인해 주세요."),
  ],
  delivery_or_smishing: [
    f("tracking_no", "운송장 번호", false, /운송장|송장번호/, "공식 배송 조회에 필요한 정보예요", "공식 앱에서 운송장 번호를 확인해 주세요."),
    f("delivery_status", "배송 상태", false, /배송|보관중|반송|주소지/, "실제 배송 상태와 문자가 일치하는지 확인해야 해요", "공식 배송 조회에서 상태를 확인해 주세요."),
    f("has_link", "링크 포함 여부", true, /https?:\/\//, "문자 링크는 누르기 전에 주소를 확인해야 해요", "문자 링크 대신 공식 앱에서 직접 확인해 주세요."),
    f("asks_info_or_pay", "개인정보·결제 요구", true, /개인정보|주소.*입력|결제|수수료|관세/, "정보나 결제 요구는 공식 채널인지 먼저 확인해야 해요", "공식 앱이나 고객센터에 같은 요청이 있는지 확인해 주세요."),
  ],
  apartment: [], other: [],
};
