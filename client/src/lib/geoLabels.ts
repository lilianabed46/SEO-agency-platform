// Canonical values stay in English — they're what's already stored for existing
// clients/websites and what the diagnosis prompt expects (see Website.niche/country
// comments in types.ts). Only the label shown to the user is Arabic (X-1).
//
// Shared between ClientProfilePage (the add-website form + websites table) and
// WebsiteDetailPage (the project info line) so a country/language always renders
// the same Arabic label everywhere instead of leaking the raw English value in
// some places and not others.
export const COUNTRIES: [value: string, label: string][] = [
  ["Afghanistan", "أفغانستان"], ["Albania", "ألبانيا"], ["Algeria", "الجزائر"], ["Andorra", "أندورا"],
  ["Angola", "أنغولا"], ["Argentina", "الأرجنتين"], ["Armenia", "أرمينيا"], ["Australia", "أستراليا"],
  ["Austria", "النمسا"], ["Azerbaijan", "أذربيجان"], ["Bahamas", "باهاماس"], ["Bahrain", "البحرين"],
  ["Bangladesh", "بنغلاديش"], ["Barbados", "باربادوس"], ["Belarus", "بيلاروسيا"], ["Belgium", "بلجيكا"],
  ["Belize", "بليز"], ["Benin", "بنين"], ["Bhutan", "بوتان"], ["Bolivia", "بوليفيا"],
  ["Bosnia and Herzegovina", "البوسنة والهرسك"], ["Botswana", "بوتسوانا"], ["Brazil", "البرازيل"],
  ["Brunei", "بروناي"], ["Bulgaria", "بلغاريا"], ["Burkina Faso", "بوركينا فاسو"], ["Burundi", "بوروندي"],
  ["Cambodia", "كمبوديا"], ["Cameroon", "الكاميرون"], ["Canada", "كندا"], ["Cape Verde", "الرأس الأخضر"],
  ["Central African Republic", "جمهورية أفريقيا الوسطى"], ["Chad", "تشاد"], ["Chile", "تشيلي"],
  ["China", "الصين"], ["Colombia", "كولومبيا"], ["Comoros", "جزر القمر"], ["Congo (DRC)", "الكونغو الديمقراطية"],
  ["Congo (Republic)", "جمهورية الكونغو"], ["Costa Rica", "كوستاريكا"], ["Croatia", "كرواتيا"],
  ["Cuba", "كوبا"], ["Cyprus", "قبرص"], ["Czech Republic", "التشيك"], ["Denmark", "الدنمارك"],
  ["Djibouti", "جيبوتي"], ["Dominica", "دومينيكا"], ["Dominican Republic", "جمهورية الدومينيكان"],
  ["Ecuador", "الإكوادور"], ["Egypt", "مصر"], ["El Salvador", "السلفادور"],
  ["Equatorial Guinea", "غينيا الاستوائية"], ["Eritrea", "إريتريا"], ["Estonia", "إستونيا"],
  ["Eswatini", "إسواتيني"], ["Ethiopia", "إثيوبيا"], ["Fiji", "فيجي"], ["Finland", "فنلندا"],
  ["France", "فرنسا"], ["Gabon", "الغابون"], ["Gambia", "غامبيا"], ["Georgia", "جورجيا"],
  ["Germany", "ألمانيا"], ["Ghana", "غانا"], ["Greece", "اليونان"], ["Grenada", "غرينادا"],
  ["Guatemala", "غواتيمالا"], ["Guinea", "غينيا"], ["Guinea-Bissau", "غينيا بيساو"], ["Guyana", "غيانا"],
  ["Haiti", "هايتي"], ["Honduras", "هندوراس"], ["Hungary", "المجر"], ["Iceland", "آيسلندا"],
  ["India", "الهند"], ["Indonesia", "إندونيسيا"], ["Iran", "إيران"], ["Iraq", "العراق"],
  ["Ireland", "أيرلندا"], ["Israel", "إسرائيل"], ["Italy", "إيطاليا"], ["Ivory Coast", "ساحل العاج"],
  ["Jamaica", "جامايكا"], ["Japan", "اليابان"], ["Jordan", "الأردن"], ["Kazakhstan", "كازاخستان"],
  ["Kenya", "كينيا"], ["Kiribati", "كيريباتي"], ["Kosovo", "كوسوفو"], ["Kuwait", "الكويت"],
  ["Kyrgyzstan", "قيرغيزستان"], ["Laos", "لاوس"], ["Latvia", "لاتفيا"], ["Lebanon", "لبنان"],
  ["Lesotho", "ليسوتو"], ["Liberia", "ليبيريا"], ["Libya", "ليبيا"], ["Liechtenstein", "ليختنشتاين"],
  ["Lithuania", "ليتوانيا"], ["Luxembourg", "لوكسمبورغ"], ["Madagascar", "مدغشقر"], ["Malawi", "مالاوي"],
  ["Malaysia", "ماليزيا"], ["Maldives", "المالديف"], ["Mali", "مالي"], ["Malta", "مالطا"],
  ["Marshall Islands", "جزر مارشال"], ["Mauritania", "موريتانيا"], ["Mauritius", "موريشيوس"],
  ["Mexico", "المكسيك"], ["Micronesia", "ميكرونيزيا"], ["Moldova", "مولدوفا"], ["Monaco", "موناكو"],
  ["Mongolia", "منغوليا"], ["Montenegro", "الجبل الأسود"], ["Morocco", "المغرب"], ["Mozambique", "موزمبيق"],
  ["Myanmar", "ميانمار"], ["Namibia", "ناميبيا"], ["Nauru", "ناورو"], ["Nepal", "نيبال"],
  ["Netherlands", "هولندا"], ["New Zealand", "نيوزيلندا"], ["Nicaragua", "نيكاراغوا"], ["Niger", "النيجر"],
  ["Nigeria", "نيجيريا"], ["North Korea", "كوريا الشمالية"], ["North Macedonia", "مقدونيا الشمالية"],
  ["Norway", "النرويج"], ["Oman", "عُمان"], ["Pakistan", "باكستان"], ["Palau", "بالاو"],
  ["Palestine", "فلسطين"], ["Panama", "بنما"], ["Papua New Guinea", "بابوا غينيا الجديدة"],
  ["Paraguay", "باراغواي"], ["Peru", "بيرو"], ["Philippines", "الفلبين"], ["Poland", "بولندا"],
  ["Portugal", "البرتغال"], ["Qatar", "قطر"], ["Romania", "رومانيا"], ["Russia", "روسيا"],
  ["Rwanda", "رواندا"], ["Saint Lucia", "سانت لوسيا"], ["Samoa", "ساموا"], ["San Marino", "سان مارينو"],
  ["Saudi Arabia", "السعودية"], ["Senegal", "السنغال"], ["Serbia", "صربيا"], ["Seychelles", "سيشل"],
  ["Sierra Leone", "سيراليون"], ["Singapore", "سنغافورة"], ["Slovakia", "سلوفاكيا"], ["Slovenia", "سلوفينيا"],
  ["Solomon Islands", "جزر سليمان"], ["Somalia", "الصومال"], ["South Africa", "جنوب أفريقيا"],
  ["South Korea", "كوريا الجنوبية"], ["South Sudan", "جنوب السودان"], ["Spain", "إسبانيا"],
  ["Sri Lanka", "سريلانكا"], ["Sudan", "السودان"], ["Suriname", "سورينام"], ["Sweden", "السويد"],
  ["Switzerland", "سويسرا"], ["Syria", "سوريا"], ["Taiwan", "تايوان"], ["Tajikistan", "طاجيكستان"],
  ["Tanzania", "تنزانيا"], ["Thailand", "تايلاند"], ["Timor-Leste", "تيمور الشرقية"], ["Togo", "توغو"],
  ["Tonga", "تونغا"], ["Trinidad and Tobago", "ترينيداد وتوباغو"], ["Tunisia", "تونس"], ["Turkey", "تركيا"],
  ["Turkmenistan", "تركمانستان"], ["Tuvalu", "توفالو"], ["Uganda", "أوغندا"], ["Ukraine", "أوكرانيا"],
  ["United Arab Emirates", "الإمارات العربية المتحدة"], ["United Kingdom", "المملكة المتحدة"],
  ["United States", "الولايات المتحدة"], ["Uruguay", "أوروغواي"], ["Uzbekistan", "أوزبكستان"],
  ["Vanuatu", "فانواتو"], ["Vatican City", "الفاتيكان"], ["Venezuela", "فنزويلا"], ["Vietnam", "فيتنام"],
  ["Yemen", "اليمن"], ["Zambia", "زامبيا"], ["Zimbabwe", "زيمبابوي"],
];

export const LANGUAGES: [value: string, label: string][] = [
  ["English", "الإنجليزية"], ["Spanish", "الإسبانية"], ["French", "الفرنسية"], ["German", "الألمانية"],
  ["Italian", "الإيطالية"], ["Portuguese", "البرتغالية"], ["Dutch", "الهولندية"], ["Russian", "الروسية"],
  ["Ukrainian", "الأوكرانية"], ["Polish", "البولندية"], ["Czech", "التشيكية"], ["Slovak", "السلوفاكية"],
  ["Romanian", "الرومانية"], ["Hungarian", "المجرية"], ["Greek", "اليونانية"], ["Swedish", "السويدية"],
  ["Norwegian", "النرويجية"], ["Danish", "الدنماركية"], ["Finnish", "الفنلندية"], ["Turkish", "التركية"],
  ["Arabic", "العربية"], ["Hebrew", "العبرية"], ["Persian", "الفارسية"], ["Hindi", "الهندية"],
  ["Urdu", "الأردية"], ["Bengali", "البنغالية"], ["Chinese", "الصينية"], ["Japanese", "اليابانية"],
  ["Korean", "الكورية"], ["Vietnamese", "الفيتنامية"], ["Thai", "التايلاندية"], ["Indonesian", "الإندونيسية"],
  ["Malay", "الملايو"], ["Filipino", "الفلبينية"], ["Swahili", "السواحيلية"],
];

export const COUNTRY_LABELS = new Map(COUNTRIES);
export const LANGUAGE_LABELS = new Map(LANGUAGES);

/**
 * A stored value is a comma-joined list of canonical (English) values — one
 * country/language, or several since the add-website form allows multi-select.
 * Renders each one through `labels`, joined with an Arabic-style separator, and
 * falls back to the raw value for anything not in the list rather than dropping it.
 */
export function joinedLabels(joined: string, labels: Map<string, string>): string {
  if (!joined) return "";
  return joined
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => labels.get(v) ?? v)
    .join("، ");
}
