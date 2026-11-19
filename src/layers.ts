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
  description: string;
  icon: LucideIcon;
  color: string;
};

// One entry per map layer; the map dots, the layer panel and place cards share these colours and icons.
export const LAYERS: Layer[] = [
  {
    id: "bus",
    label: "Arrêts de bus",
    description: "Lignes régulières · arrêts GTFS",
    icon: BusFront,
    color: "#387aa0",
  },
  {
    id: "train",
    label: "Gares",
    description: "Gares et haltes ferroviaires",
    icon: TrainFront,
    color: "#a14c69",
  },
  {
    id: "montenvelo",
    label: "MontenVélo",
    description: "Vélos en libre-service",
    icon: Bike,
    color: "#15876c",
  },
  {
    id: "lift",
    label: "Liaisons verticales",
    description: "Valléen et ascenseur des Thermes",
    icon: CableCar,
    color: "#c78a23",
  },
  {
    id: "citiz",
    label: "Citiz",
    description: "Voitures partagées en boucle",
    icon: CarFront,
    color: "#bc4e2f",
  },
  {
    id: "rezopouce",
    label: "Rézo Pouce",
    description: "Autostop organisé",
    icon: Hand,
    color: "#725ba4",
  },
  {
    id: "montenbus",
    label: "Montenbus",
    description: "Transport sur réservation",
    icon: PhoneCall,
    color: "#5b6475",
  },
  {
    id: "shuttle",
    label: "Navettes",
    description: "Arrêts de navettes · saisons variables",
    icon: Van,
    color: "#0f8aa6",
  },
];

export const DEFAULT_LAYERS = ["bus", "montenvelo", "train", "lift"];
export const layerById = Object.fromEntries(LAYERS.map((l) => [l.id, l]));
