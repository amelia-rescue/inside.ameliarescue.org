import { RoleStore } from "./role-store";
import { TrackStore } from "./track-store";
import { CertificationTypeStore } from "./certification-type-store";
import { MembershipService } from "./membership-service";

export async function seedMembershipHierarchy() {
  const roleStore = RoleStore.make();
  const trackStore = TrackStore.make();
  const certificationTypeStore = CertificationTypeStore.make();
  const membershipService = new MembershipService();

  const roles = [
    {
      name: "Provider",
      description: "Medical care provider on ambulance",
      allowed_tracks: ["emt", "paramedic"],
    },
    {
      name: "Driver",
      description: "Ambulance driver",
      allowed_tracks: ["driver_basic"],
    },
    {
      name: "Junior",
      description: "Junior member in training",
      allowed_tracks: ["emt"],
    },
  ];

  const tracks = [
    {
      name: "EMT",
      description: "Emergency Medical Technician track",
      required_certifications: ["EMT-B", "CPR"],
    },
    {
      name: "Paramedic",
      description: "Paramedic track",
      required_certifications: ["Paramedic", "CPR"],
    },
    {
      name: "Driver Basic",
      description: "Basic driver certification track",
      required_certifications: ["Drivers License", "EVOC", "CPR"],
    },
  ];

  const certificationTypes = [
    {
      name: "EMT-B",
      description: "Emergency Medical Technician - Basic",
      expires: true,
    },
    {
      name: "Paramedic",
      description: "Paramedic Certification",
      expires: true,
    },
    {
      name: "CPR",
      description: "CPR Certification",
      expires: true,
    },
    {
      name: "Drivers License",
      description: "Valid Drivers License",
      expires: true,
    },
    {
      name: "EVOC",
      description: "Emergency Vehicle Operator Course",
      expires: false,
    },
  ];

  for (const role of roles) {
    await roleStore.createRole(role);
  }

  for (const track of tracks) {
    await trackStore.createTrack(track);
  }

  for (const certType of certificationTypes) {
    await certificationTypeStore.createCertificationType(certType);
  }

  console.log("Membership hierarchy seeded successfully!");
}
