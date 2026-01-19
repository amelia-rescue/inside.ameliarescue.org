export default function Protocols() {
  const protocols = [
    {
      name: "ODEMSA",
      description: "Operational medical protocols and guidelines",
      url: "", // To be added later
    },
    {
      name: "Radio",
      description: "Radio communication protocols and procedures",
      url: "", // To be added later
    },
    {
      name: "Response Priority",
      description: "Response priority levels and dispatch protocols",
      url: "", // To be added later
    },
  ];

  return (
    <div className="card bg-base-100 shadow">
      <div className="card-body">
        <h1 className="card-title text-2xl">Protocols</h1>
        <p className="text-sm opacity-70">
          Access operational protocols and guidelines
        </p>

        <div className="divider" />

        <div className="grid gap-4">
          {protocols.map((protocol) => (
            <div key={protocol.name} className="card bg-base-200">
              <div className="card-body">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="card-title text-lg">{protocol.name}</h2>
                    <p className="text-sm opacity-70">{protocol.description}</p>
                  </div>
                  {protocol.url ? (
                    <a
                      href={protocol.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-primary btn-sm"
                    >
                      View Protocol
                    </a>
                  ) : (
                    <button className="btn btn-sm btn-disabled">
                      Link Coming Soon
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
