export type FilterOption = {
  value: string;
  label: string;
};

export const vehicleFilterOptions = {
  fuels: [
    { value: "petrol", label: "Бензин" },
    { value: "diesel", label: "Дизель" },
    { value: "hybrid", label: "Гибрид" },
    { value: "plugin-hybrid", label: "Подключаемый гибрид" },
    { value: "electric", label: "Электро" },
    { value: "lpg", label: "Газ LPG" },
    { value: "cng", label: "Газ CNG" },
    { value: "hydrogen", label: "Водород" },
    { value: "ethanol", label: "Этанол" },
  ],
  transmissions: [
    { value: "automatic", label: "Автомат" },
    { value: "manual", label: "Механика" },
    { value: "semi-automatic", label: "Робот / полуавтомат" },
  ],
  bodyTypes: [
    { value: "sedan", label: "Седан" },
    { value: "hatchback", label: "Хэтчбек" },
    { value: "wagon", label: "Универсал" },
    { value: "suv", label: "Внедорожник / кроссовер" },
    { value: "minivan", label: "Минивэн" },
    { value: "coupe", label: "Купе" },
    { value: "convertible", label: "Кабриолет" },
    { value: "pickup", label: "Пикап" },
    { value: "van", label: "Фургон" },
  ],
  drivetrains: [
    { value: "fwd", label: "Передний привод" },
    { value: "rwd", label: "Задний привод" },
    { value: "awd", label: "Полный привод" },
  ],
  locations: [
    { value: "estonia", label: "Эстония — вся страна" },
    { value: "tallinn", label: "Tallinn" },
    { value: "tartu", label: "Tartu" },
    { value: "parnu", label: "Pärnu" },
    { value: "narva", label: "Narva" },
    { value: "rakvere", label: "Rakvere" },
    { value: "viljandi", label: "Viljandi" },
    { value: "voru", label: "Võru" },
    { value: "kuressaare", label: "Kuressaare" },
    { value: "haapsalu", label: "Haapsalu" },
    { value: "harjumaa", label: "Harjumaa" },
    { value: "tartumaa", label: "Tartumaa" },
    { value: "parnumaa", label: "Pärnumaa" },
    { value: "latvia", label: "Латвия — вся страна" },
    { value: "riga", label: "Rīga" },
    { value: "finland", label: "Финляндия — вся страна" },
    { value: "germany", label: "Германия — вся страна" },
  ],
} satisfies Record<string, FilterOption[]>;

export const auto24FilterValues = {
  fuel: {
    petrol: ["1"],
    diesel: ["2"],
    electric: ["6"],
    lpg: ["3", "4"],
    cng: ["10", "9"],
    hybrid: ["5", "14", "15"],
    "plugin-hybrid": ["16", "17"],
    hydrogen: ["7"],
    ethanol: ["8"],
  },
  transmission: {
    manual: ["1"],
    automatic: ["2"],
    "semi-automatic": ["3"],
  },
  drivetrain: {
    fwd: ["1"],
    rwd: ["2"],
    awd: ["3"],
  },
  bodyType: {
    sedan: ["1"],
    hatchback: ["2"],
    wagon: ["3"],
    suv: ["7"],
    minivan: ["4"],
    coupe: ["5", "70"],
    convertible: ["6", "69"],
    pickup: ["61", "8"],
    van: ["9", "10"],
  },
  location: {
    estonia: ["-1"],
    tallinn: ["3"],
    tartu: ["1"],
    parnu: ["5"],
    narva: ["35"],
    rakvere: ["9"],
    viljandi: ["8"],
    voru: ["6"],
    kuressaare: ["7"],
    haapsalu: ["19"],
    harjumaa: ["15"],
    tartumaa: ["55"],
    parnumaa: ["52"],
    latvia: ["-2"],
    riga: ["38"],
    finland: ["-17"],
    germany: ["-4"],
  },
} as const;

export function optionLabel(
  group: keyof typeof vehicleFilterOptions,
  value?: string,
) {
  if (!value) return undefined;
  return vehicleFilterOptions[group].find((option) => option.value === value)?.label;
}
