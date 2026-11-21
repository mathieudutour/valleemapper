import {
  Bike,
  BusFront,
  CableCar,
  CarFront,
  Hand,
  PhoneCall,
  TrainFront,
  Van,
  type LucideIcon,
} from "lucide-react";

export type Layer = {
  id: string;
  label: string;
  /** One point of the layer, as a place card names it. */
  singular: string;
  description: string;
  icon: LucideIcon;
  color: string;
};

// One entry per map layer; the map dots, the layer panel and place cards share these colours and icons.
export const LAYERS: Layer[] = [
  {
    id: "bus",
    label: "Arrêts de bus",
    singular: "Arrêt de bus",
    description: "Lignes régulières de bus et de cars",
    icon: BusFront,
    color: "#387aa0",
  },
  {
    id: "train",
    label: "Gares",
    singular: "Gare",
    description: "Gares et haltes ferroviaires",
    icon: TrainFront,
    color: "#a14c69",
  },
  {
    id: "montenvelo",
    label: "MontenVélo",
    singular: "Station MontenVélo",
    description: "Vélos en libre-service",
    icon: Bike,
    color: "#15876c",
  },
  {
    id: "lift",
    label: "Liaisons verticales",
    singular: "Liaison verticale",
    description: "Valléen et ascenseur des Thermes",
    icon: CableCar,
    color: "#c78a23",
  },
  {
    id: "citiz",
    label: "Citiz",
    singular: "Station Citiz",
    description: "Voitures partagées en boucle",
    icon: CarFront,
    color: "#bc4e2f",
  },
  {
    id: "rezopouce",
    label: "Rézo Pouce",
    singular: "Arrêt Rézo Pouce",
    description: "Autostop organisé",
    icon: Hand,
    color: "#725ba4",
  },
  {
    id: "montenbus",
    label: "Montenbus",
    singular: "Point Montenbus",
    description: "Transport sur réservation",
    icon: PhoneCall,
    color: "#5b6475",
  },
  {
    id: "shuttle",
    label: "Navettes",
    singular: "Arrêt de navette",
    description: "Navettes gratuites des stations, selon la saison",
    icon: Van,
    color: "#0f8aa6",
  },
];

export const DEFAULT_LAYERS = ["bus", "shuttle", "montenvelo", "train", "lift"];
export const layerById = Object.fromEntries(LAYERS.map((l) => [l.id, l]));
